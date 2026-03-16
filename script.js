import { db, auth } from './firebase-config.js';
import { 
    collection, addDoc, onSnapshot, query, orderBy, 
    doc, updateDoc, deleteDoc, getDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// === 1. ESTADO GLOBAL DE LA APLICACIÓN ===
let state = {
    user: null,
    items: [], // Inventario completo
    logs: [],  // Historial
    filtros: { texto: "", sector: "Todos" },
    cargando: true
};

// === 2. CONTROL DE AUTENTICACIÓN ===
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userSnap = await getDoc(doc(db, "usuarios", user.email));
            if (userSnap.exists()) {
                state.user = userSnap.data();
                document.getElementById('user-badge').innerText = `ROL: ${state.user.rol}`;
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app-interface').classList.remove('hidden');
                iniciarSuscripciones();
            } else {
                mostrarAlerta("Usuario sin rol asignado en DB", "error");
                signOut(auth);
            }
        } catch (error) {
            mostrarAlerta("Error al verificar usuario", "error");
        }
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-interface').classList.add('hidden');
    }
});

// === 3. SUSCRIPCIÓN A DATOS EN TIEMPO REAL ===
function iniciarSuscripciones() {
    // Escuchar cambios en Inventario
    onSnapshot(query(collection(db, "inventario"), orderBy("nombre", "asc")), (snap) => {
        state.items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.cargando = false;
        renderAll();
    });

    // Escuchar cambios en Historial
    onSnapshot(query(collection(db, "historial"), orderBy("fecha", "desc")), (snap) => {
        state.logs = snap.docs.map(d => d.data());
        renderHistorial();
    });
}

// === 4. RENDERIZADO OPTIMIZADO CON SKELETONS ===
function renderAll() {
    const body = document.getElementById('body-stock');
    
    // Mostrar Skeletons si está cargando
    if (state.cargando) {
        body.innerHTML = `
            <tr class="is-loading">
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-badge"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-badge"></div></td>
            </tr>
        `.repeat(5);
        return;
    }

    const hoy = new Date();
    const proximoMes = new Date();
    proximoMes.setDate(hoy.getDate() + 30);

    // Aplicar Filtros (Buscador + Sector)
    const filtrados = state.items.filter(item => {
        const matchText = item.nombre.toLowerCase().includes(state.filtros.texto) || 
                          item.lote.toLowerCase().includes(state.filtros.texto);
        const matchSec = state.filtros.sector === "Todos" || item.sector === state.filtros.sector;
        return matchText && matchSec;
    });

    if (filtrados.length === 0) {
        body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem;">No se encontraron resultados</td></tr>`;
    } else {
        body.innerHTML = filtrados.map(item => {
            const vDate = new Date(item.vence);
            const critico = item.cantidad < 10;
            const porVencer = vDate <= proximoMes;

            return `
                <tr class="${porVencer ? 'row-vence-warning' : ''}">
                    <td><strong>${item.nombre}</strong></td>
                    <td><code>${item.lote}</code></td>
                    <td><span class="date-badge ${porVencer ? 'vence-alert' : ''}">${item.vence}</span></td>
                    <td><span class="badge-sector sector-${item.sector}">${item.sector}</span></td>
                    <td class="${critico ? 'stock-low' : ''}">${item.cantidad} <small>${item.unidad}</small></td>
                    <td>
                        <button onclick="eliminarItem('${item.id}', '${item.sector}')" class="btn-icon-del">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    actualizarSelectTraspaso();
}

// === 5. LÓGICA DE NEGOCIO Y ACCIONES ===
window.eliminarItem = async (id, sector) => {
    if (!verificarPermiso(sector)) return;
    if (confirm("¿Estás seguro de eliminar este lote permanentemente?")) {
        try {
            await deleteDoc(doc(db, "inventario", id));
            registrarLog("ELIMINACIÓN", `Lote eliminado en sector ${sector}`);
            mostrarAlerta("Item eliminado", "success");
        } catch (e) {
            mostrarAlerta("Error al eliminar", "error");
        }
    }
};

document.getElementById('form-alta').onsubmit = async (e) => {
    e.preventDefault();
    const sector = document.getElementById('sector').value;
    if (!verificarPermiso(sector)) return;

    const data = {
        nombre: document.getElementById('nombre').value.toUpperCase(),
        lote: document.getElementById('lote').value,
        sector: sector,
        cantidad: parseFloat(document.getElementById('cantidad').value),
        unidad: document.getElementById('unidad').value,
        vence: document.getElementById('vence').value,
        actualizado: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "inventario"), data);
        registrarLog("INGRESO", `${data.nombre} (${data.cantidad}${data.unidad}) en ${sector}`);
        mostrarAlerta("Registro exitoso", "success");
        e.target.reset();
    } catch (err) {
        mostrarAlerta("Error al guardar datos", "error");
    }
};

// === 6. UTILIDADES ===
function verificarPermiso(sectorDestino) {
    if (state.user.rol === "ADMIN" || state.user.rol === sectorDestino) return true;
    mostrarAlerta(`⛔ Acceso denegado: Tu rol es ${state.user.rol}`, "error");
    return false;
}

function mostrarAlerta(msj, tipo) {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerText = msj;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

async function registrarLog(accion, detalle) {
    await addDoc(collection(db, "historial"), {
        fecha: new Date().toLocaleString(),
        accion, 
        detalle,
        usuario: auth.currentUser.email
    });
}

// === 7. EVENTOS DE INTERFAZ ===
document.getElementById('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        mostrarAlerta("Credenciales incorrectas", "error");
    }
};

document.getElementById('search-input').oninput = (e) => {
    state.filtros.texto = e.target.value.toLowerCase();
    renderAll();
};

document.getElementById('filter-sector').onchange = (e) => {
    state.filtros.sector = e.target.value;
    renderAll();
};

window.showSection = (id) => {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`sec-${id}`).classList.remove('hidden');
};

document.getElementById('btn-logout').onclick = () => signOut(auth);

function actualizarSelectTraspaso() {
    const select = document.getElementById('select-materia');
    select.innerHTML = state.items.map(i => 
        `<option value="${i.id}">${i.nombre} - Lote: ${i.lote} (${i.sector})</option>`
    ).join('');
}

function renderHistorial() {
    document.getElementById('body-historial').innerHTML = state.logs.map(l => `
        <tr>
            <td><small>${l.fecha}</small></td>
            <td><strong>${l.accion}</strong></td>
            <td>${l.detalle}</td>
            <td>${l.usuario.split('@')[0]}</td>
        </tr>
    `).join('');
}

// === LÓGICA DE TRASPASO / CONSUMO ===
document.getElementById('form-traspaso').onsubmit = async (e) => {
    e.preventDefault();
    
    const idOrigen = document.getElementById('select-materia').value;
    const sectorDestino = document.getElementById('sector-destino').value;
    const cantidadAMover = parseFloat(document.getElementById('cant-traspaso').value);
    
    const itemOrigen = state.items.find(i => i.id === idOrigen);
    
    if (!itemOrigen) return;
    if (cantidadAMover > itemOrigen.cantidad) {
        mostrarAlerta("Cantidad insuficiente en stock", "error");
        return;
    }

    // Verificar permisos: Debe tener permiso en el sector de ORIGEN para sacar material
    if (!verificarPermiso(itemOrigen.sector)) return;

    try {
        const docRef = doc(db, "inventario", idOrigen);
        const nuevaCantOrigen = itemOrigen.cantidad - cantidadAMover;

        if (nuevaCantOrigen <= 0) {
            await deleteDoc(docRef);
        } else {
            await updateDoc(docRef, { cantidad: nuevaCantOrigen });
        }

        if (sectorDestino !== "CONSUMIDO") {
            // Crear nuevo registro en el sector destino
            await addDoc(collection(db, "inventario"), {
                nombre: itemOrigen.nombre,
                lote: itemOrigen.lote,
                vence: itemOrigen.vence,
                unidad: itemOrigen.unidad,
                sector: sectorDestino,
                cantidad: cantidadAMover,
                actualizado: serverTimestamp()
            });
            registrarLog("TRASPASO", `${itemOrigen.nombre}: ${cantidadAMover}${itemOrigen.unidad} de ${itemOrigen.sector} a ${sectorDestino}`);
        } else {
            registrarLog("CONSUMO", `${itemOrigen.nombre}: ${cantidadAMover}${itemOrigen.unidad} de ${itemOrigen.sector}`);
        }

        mostrarAlerta("Movimiento procesado", "success");
        e.target.reset();
    } catch (err) {
        console.error(err);
        mostrarAlerta("Error al procesar movimiento", "error");
    }
};

document.getElementById('btn-export').onclick = () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Inventario Protergium", 14, 15);
    doc.autoTable({
        html: 'table',
        startY: 20,
        theme: 'grid'
    });
    doc.save('inventario.pdf');
};