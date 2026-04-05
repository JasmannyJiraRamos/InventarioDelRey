// ==================== DATABASE (Dexie) ====================
const db = new Dexie('BazarDelReyDB');
db.version(1).stores({
    toys: '++id, name, category, price, cost, stock, image',
    sales: '++id, toyId, toyName, quantity, pricePerUnit, total, date, profit'
});

// ==================== GLOBAL STATE ====================
let currentTab = 'inventory';
let editingToyId = null;
let selectedProductId = null;
let currentReportPeriod = 'day'; // day, week, month

// Helper: format date to local string
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

// Helper: get start of day, week, month
function getPeriodRange(period) {
    const now = new Date();
    let start;
    if (period === 'day') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
        const day = now.getDay();
        const diff = day === 0 ? 6 : day - 1; // Monday as start
        start = new Date(now);
        start.setDate(now.getDate() - diff);
        start.setHours(0,0,0,0);
    } else { // month
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { start, end: now };
}

// ==================== TOYS CRUD ====================
async function loadToys() {
    const toys = await db.toys.toArray();
    renderInventory(toys);
    populateProductSelect(toys);
    return toys;
}

function renderInventory(toys) {
    const container = document.getElementById('inventoryGrid');
    if (!toys.length) {
        container.innerHTML = '<div class="empty-message">📦 No hay juguetes. Agregá uno nuevo.</div>';
        return;
    }
    container.innerHTML = toys.map(toy => `
        <div class="toy-card">
            <div class="toy-image">
                ${toy.image ? `<img src="${toy.image}" alt="${toy.name}">` : '<i class="fas fa-camera" style="font-size: 3rem; opacity:0.5;"></i>'}
            </div>
            <div class="toy-info">
                <div class="toy-name">${escapeHtml(toy.name)}</div>
                <div class="toy-category">${escapeHtml(toy.category || 'Sin categoría')}</div>
                <div class="toy-price">$${toy.price.toFixed(2)}</div>
                <div class="toy-stock">Stock: ${toy.stock}</div>
                <div class="card-actions">
                    <button class="edit-toy" data-id="${toy.id}"><i class="fas fa-edit"></i> Editar</button>
                    <button class="delete-toy" data-id="${toy.id}"><i class="fas fa-trash"></i> Eliminar</button>
                </div>
            </div>
        </div>
    `).join('');
    // attach events
    document.querySelectorAll('.edit-toy').forEach(btn => {
        btn.addEventListener('click', () => editToy(parseInt(btn.dataset.id)));
    });
    document.querySelectorAll('.delete-toy').forEach(btn => {
        btn.addEventListener('click', () => deleteToy(parseInt(btn.dataset.id)));
    });
}

async function addOrUpdateToy(event) {
    event.preventDefault();
    const id = document.getElementById('toyId').value;
    const name = document.getElementById('toyName').value.trim();
    const category = document.getElementById('toyCategory').value.trim();
    const price = parseFloat(document.getElementById('toyPrice').value);
    const cost = parseFloat(document.getElementById('toyCost').value) || 0;
    let stock = parseInt(document.getElementById('toyStock').value);
    if (isNaN(stock)) stock = 0;
    const imageFile = document.getElementById('toyImage').files[0];
    let imageData = null;
    if (imageFile) {
        imageData = await readFileAsDataURL(imageFile);
    } else if (id && !imageFile) {
        // keep existing image if not replaced
        const existing = await db.toys.get(parseInt(id));
        if (existing) imageData = existing.image;
    }
    const toyData = { name, category, price, cost, stock, image: imageData };
    if (id) {
        toyData.id = parseInt(id);
        await db.toys.put(toyData);
    } else {
        await db.toys.add(toyData);
    }
    closeForm();
    loadToys();
}

function readFileAsDataURL(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

async function editToy(id) {
    const toy = await db.toys.get(id);
    if (!toy) return;
    editingToyId = id;
    document.getElementById('toyId').value = toy.id;
    document.getElementById('toyName').value = toy.name;
    document.getElementById('toyCategory').value = toy.category || '';
    document.getElementById('toyPrice').value = toy.price;
    document.getElementById('toyCost').value = toy.cost || 0;
    document.getElementById('toyStock').value = toy.stock;
    document.getElementById('toyImage').value = '';
    const previewDiv = document.getElementById('imagePreview');
    previewDiv.innerHTML = toy.image ? `<img src="${toy.image}" style="max-width:100px;">` : '';
    document.getElementById('formTitle').innerText = 'Editar juguete';
    document.getElementById('toyFormContainer').classList.remove('hidden');
    document.getElementById('showAddToyBtn').style.display = 'none';
}

async function deleteToy(id) {
    if (confirm('¿Eliminar este juguete? También se perderán las ventas asociadas (opcional).')) {
        await db.toys.delete(id);
        // optionally delete related sales? we keep sales for historical, but toyId will be orphan
        loadToys();
    }
}

function closeForm() {
    document.getElementById('toyForm').reset();
    document.getElementById('toyId').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('formTitle').innerText = 'Agregar juguete';
    document.getElementById('toyFormContainer').classList.add('hidden');
    document.getElementById('showAddToyBtn').style.display = 'flex';
    editingToyId = null;
}

// ==================== SALES ====================
function populateProductSelect(toys) {
    const select = document.getElementById('productSelect');
    select.innerHTML = '<option value="">-- Elige un producto --</option>' +
        toys.map(t => `<option value="${t.id}" data-price="${t.price}" data-stock="${t.stock}">${t.name} (stock: ${t.stock})</option>`).join('');
    select.value = selectedProductId || '';
    if (selectedProductId) updateProductInfo(selectedProductId);
}

async function updateProductInfo(toyId) {
    const toy = await db.toys.get(toyId);
    if (!toy) {
        document.getElementById('selectedProductInfo').innerHTML = '';
        return;
    }
    document.getElementById('selectedProductInfo').innerHTML = `
        <div><strong>${escapeHtml(toy.name)}</strong> - $${toy.price.toFixed(2)}</div>
        <div>Stock disponible: ${toy.stock}</div>
        ${toy.image ? `<img src="${toy.image}" style="max-width:60px; border-radius:12px;">` : ''}
    `;
    updateSaleTotal();
}

function updateSaleTotal() {
    const toyId = document.getElementById('productSelect').value;
    if (!toyId) {
        document.getElementById('saleTotal').innerText = '$0.00';
        return;
    }
    const option = document.querySelector(`#productSelect option[value="${toyId}"]`);
    const price = parseFloat(option?.dataset.price || 0);
    const quantity = parseInt(document.getElementById('saleQuantity').value) || 0;
    const total = price * quantity;
    document.getElementById('saleTotal').innerText = `$${total.toFixed(2)}`;
}

async function recordSale() {
    const toyId = document.getElementById('productSelect').value;
    if (!toyId) { alert('Seleccioná un juguete'); return; }
    const quantity = parseInt(document.getElementById('saleQuantity').value);
    if (quantity <= 0) { alert('Cantidad inválida'); return; }
    const toy = await db.toys.get(parseInt(toyId));
    if (!toy) { alert('Producto no encontrado'); return; }
    if (toy.stock < quantity) { alert(`Stock insuficiente. Solo ${toy.stock} disponibles.`); return; }
    const total = toy.price * quantity;
    const profit = (toy.price - (toy.cost || 0)) * quantity;
    const sale = {
        toyId: toy.id,
        toyName: toy.name,
        quantity: quantity,
        pricePerUnit: toy.price,
        total: total,
        profit: profit,
        date: new Date().getTime()
    };
    await db.sales.add(sale);
    // update stock
    toy.stock -= quantity;
    await db.toys.put(toy);
    // refresh views
    loadToys();
    await loadRecentSales();
    document.getElementById('saleQuantity').value = 1;
    document.getElementById('productSelect').value = '';
    document.getElementById('selectedProductInfo').innerHTML = '';
    updateSaleTotal();
    alert('Venta registrada correctamente');
}

async function loadRecentSales() {
    const sales = await db.sales.orderBy('date').reverse().limit(10).toArray();
    const container = document.getElementById('recentSalesList');
    if (!sales.length) {
        container.innerHTML = '<div>No hay ventas recientes.</div>';
        return;
    }
    container.innerHTML = sales.map(s => `
        <div class="sale-item">
            <span><strong>${escapeHtml(s.toyName)}</strong> x${s.quantity}</span>
            <span>$${s.total.toFixed(2)}</span>
            <span>${formatDate(s.date)}</span>
        </div>
    `).join('');
}

// ==================== REPORTS ====================
async function updateReports(period = currentReportPeriod) {
    const { start, end } = getPeriodRange(period);
    const sales = await db.sales.where('date').between(start.getTime(), end.getTime()).toArray();
    const totalIncome = sales.reduce((sum, s) => sum + s.total, 0);
    const totalProfit = sales.reduce((sum, s) => sum + (s.profit || 0), 0);
    document.getElementById('totalIncome').innerText = `$${totalIncome.toFixed(2)}`;
    document.getElementById('totalProfit').innerText = `$${totalProfit.toFixed(2)}`;
    document.getElementById('salesCount').innerText = sales.length;
    // detail list
    const detailContainer = document.getElementById('periodSalesList');
    if (!sales.length) {
        detailContainer.innerHTML = '<div>No hay ventas en este período.</div>';
        return;
    }
    detailContainer.innerHTML = sales.map(s => `
        <div class="sale-item">
            <span><strong>${escapeHtml(s.toyName)}</strong> x${s.quantity}</span>
            <span>$${s.total.toFixed(2)}</span>
            <span>${formatDate(s.date)}</span>
        </div>
    `).join('');
}

// ==================== UI HELPERS ====================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== TAB SWITCHING ====================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(`${tabId}Tab`).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    currentTab = tabId;
    if (tabId === 'sales') {
        loadRecentSales();
    } else if (tabId === 'reports') {
        updateReports(currentReportPeriod);
    }
}

// ==================== INITIALIZATION ====================
async function init() {
    // set current date
    const now = new Date();
    document.getElementById('currentDate').innerHTML = now.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    // load inventory
    await loadToys();
    await loadRecentSales();
    await updateReports('day');
    // event listeners
    document.getElementById('showAddToyBtn').addEventListener('click', () => {
        document.getElementById('toyFormContainer').classList.remove('hidden');
        document.getElementById('showAddToyBtn').style.display = 'none';
    });
    document.getElementById('cancelFormBtn').addEventListener('click', closeForm);
    document.getElementById('toyForm').addEventListener('submit', addOrUpdateToy);
    document.getElementById('productSelect').addEventListener('change', (e) => {
        selectedProductId = e.target.value;
        if (selectedProductId) updateProductInfo(selectedProductId);
        else document.getElementById('selectedProductInfo').innerHTML = '';
        updateSaleTotal();
    });
    document.getElementById('saleQuantity').addEventListener('input', updateSaleTotal);
    document.getElementById('recordSaleBtn').addEventListener('click', recordSale);
    // report filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentReportPeriod = btn.dataset.period;
            updateReports(currentReportPeriod);
        });
    });
    // tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    // optional: seed some demo data if empty
    const toyCount = await db.toys.count();
    if (toyCount === 0) {
        await db.toys.bulkAdd([
            { name: 'Oso Peluche Real', category: 'Peluches', price: 25.99, cost: 12.5, stock: 15, image: null },
            { name: 'Coche de Carreras', category: 'Vehículos', price: 19.90, cost: 9.0, stock: 8, image: null },
            { name: 'Bloques Educativos', category: 'Educativo', price: 32.50, cost: 18.0, stock: 12, image: null }
        ]);
        await loadToys();
    }
}

init();