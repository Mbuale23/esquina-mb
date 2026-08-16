// ============================================
// ESQUINA DE VENDA MB — painel de administração
// ============================================

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginShell = document.getElementById("loginShell");
const adminShell = document.getElementById("adminShell");
const modalRoot = document.getElementById("modalRoot");

let currentTab = "orders";
let orders = [];
let products = [];

// ---------- Autenticação ----------
document.getElementById("loginBtn").onclick = async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = "Email ou palavra-passe incorretos.";
    return;
  }
  showAdmin();
};

document.getElementById("logoutBtn").onclick = async () => {
  await sb.auth.signOut();
  location.reload();
};

async function checkSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) showAdmin();
}

function showAdmin() {
  loginShell.style.display = "none";
  adminShell.style.display = "block";
  loadOrders();
  loadProducts();
}

// ---------- Navegação entre separadores ----------
document.querySelectorAll(".admin-nav button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".admin-nav button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    document.getElementById("tab-orders").style.display = currentTab === "orders" ? "block" : "none";
    document.getElementById("tab-products").style.display = currentTab === "products" ? "block" : "none";
  };
});

function money(n) { return Number(n).toLocaleString("pt-AO", { minimumFractionDigits: 0 }) + " Kz"; }
function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }

// ============================================
// ENCOMENDAS
// ============================================
async function loadOrders() {
  const { data, error } = await sb.from("orders").select("*").order("created_at", { ascending: false });
  const el = document.getElementById("tab-orders");
  if (error) {
    el.innerHTML = `<p class="error-msg">Erro ao carregar encomendas: ${error.message}</p>`;
    return;
  }
  orders = data || [];
  renderOrders();
}

function renderOrders() {
  const el = document.getElementById("tab-orders");
  if (orders.length === 0) {
    el.innerHTML = `<p class="empty-note">Ainda não há encomendas.</p>`;
    return;
  }
  el.innerHTML = `
    <table class="data">
      <thead>
        <tr><th>Cliente</th><th>Itens</th><th>Total</th><th>Comprovativo</th><th>Estado</th><th>Ações</th></tr>
      </thead>
      <tbody>
        ${orders.map(o => `
          <tr>
            <td>${escapeHtml(o.customer_name)}<br><small>${escapeHtml(o.phone)}</small></td>
            <td>${o.items.map(i => `${i.qty}× ${escapeHtml(i.name)}`).join("<br>")}</td>
            <td>${money(o.total)}</td>
            <td><a class="proof-link" href="${o.proof_url}" target="_blank">Ver comprovativo</a></td>
            <td><span class="badge ${o.status}">${o.status}</span></td>
            <td>
              ${o.status === "pendente" ? `
                <button class="icon-btn approve" onclick="approveOrder('${o.id}')" title="Aprovar">✔ Aprovar</button>
                <button class="icon-btn reject" onclick="rejectOrder('${o.id}')" title="Rejeitar">✕ Rejeitar</button>
              ` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function approveOrder(id) {
  const order = orders.find(o => o.id === id);
  if (!order) return;
  if (!confirm("Confirmar pagamento e aprovar esta encomenda? O stock será atualizado.")) return;

  // Reduzir stock de cada item
  for (const item of order.items) {
    const { data: prod } = await sb.from("products").select("stock").eq("id", item.id).single();
    if (prod) {
      const newStock = Math.max(0, prod.stock - item.qty);
      await sb.from("products").update({ stock: newStock }).eq("id", item.id);
    }
  }

  await sb.from("orders").update({ status: "aprovado" }).eq("id", id);
  loadOrders();
  loadProducts();
}

async function rejectOrder(id) {
  if (!confirm("Rejeitar esta encomenda?")) return;
  await sb.from("orders").update({ status: "rejeitado" }).eq("id", id);
  loadOrders();
}

// ============================================
// PRODUTOS
// ============================================
async function loadProducts() {
  const { data, error } = await sb.from("products").select("*").order("created_at", { ascending: false });
  const el = document.getElementById("tab-products");
  if (error) {
    el.innerHTML = `<p class="error-msg">Erro ao carregar produtos: ${error.message}</p>`;
    return;
  }
  products = data || [];
  renderProducts();
}

function renderProducts() {
  const el = document.getElementById("tab-products");
  el.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn-primary" style="width:auto; padding:10px 20px;" onclick="openProductModal()">+ Adicionar produto</button>
    </div>
    ${products.length === 0 ? `<p class="empty-note">Ainda não adicionou produtos.</p>` : `
      <table class="data">
        <thead><tr><th></th><th>Nome</th><th>Categoria</th><th>Preço</th><th>Stock</th><th>Ações</th></tr></thead>
        <tbody>
          ${products.map(p => `
            <tr>
              <td>${getProductImages(p)[0] ? `<img class="thumb-sm" src="${getProductImages(p)[0]}">` : ""}</td>
              <td>${escapeHtml(p.name)}</td>
              <td>${p.category}</td>
              <td>${money(p.price)}</td>
              <td>${p.stock}</td>
              <td>
                <button class="icon-btn edit" onclick="openProductModal('${p.id}')">✎ Editar</button>
                <button class="icon-btn reject" onclick="deleteProduct('${p.id}')">🗑 Apagar</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `}
  `;
}

const MAX_IMAGES = 4;
let modalImages = []; // URLs das fotos do produto a editar/criar

function getProductImages(p) {
  if (p?.image_urls && p.image_urls.length) return p.image_urls;
  if (p?.image_url) return [p.image_url];
  return [];
}

function openProductModal(id) {
  const editing = id ? products.find(p => p.id === id) : null;
  modalImages = editing ? [...getProductImages(editing)] : [];

  modalRoot.innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal">
        <h3>${editing ? "Editar produto" : "Novo produto"}</h3>
        <div class="field"><label>Nome</label><input id="pName" value="${editing ? escapeHtml(editing.name) : ""}"></div>
        <div class="field">
          <label>Categoria</label>
          <select id="pCategory">
            <option value="Roupas" ${editing?.category === "Roupas" ? "selected" : ""}>Roupas</option>
            <option value="Acessórios" ${editing?.category === "Acessórios" ? "selected" : ""}>Acessórios</option>
            <option value="Eletrodomésticos" ${editing?.category === "Eletrodomésticos" ? "selected" : ""}>Eletrodomésticos</option>
          </select>
        </div>
        <div class="field"><label>Preço (Kz)</label><input id="pPrice" type="number" value="${editing ? editing.price : ""}"></div>
        <div class="field"><label>Stock (unidades)</label><input id="pStock" type="number" value="${editing ? editing.stock : ""}"></div>
        <div class="field"><label>Descrição (opcional)</label><textarea id="pDesc" rows="2">${editing ? escapeHtml(editing.description || "") : ""}</textarea></div>
        <div class="field">
          <label>Fotos do produto (1 a ${MAX_IMAGES})</label>
          <div id="pImagesPreview" class="images-preview"></div>
          <input type="file" id="pImage" accept="image/*" multiple>
          <div class="hint" id="pImageHint"></div>
        </div>
        <div id="pError" class="error-msg"></div>
        <div class="modal-actions">
          <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn-primary" id="saveProductBtn">${editing ? "Guardar" : "Adicionar"}</button>
        </div>
      </div>
    </div>
  `;
  renderImagePreview();
  document.getElementById("pImage").onchange = handleImageSelect;
  document.getElementById("saveProductBtn").onclick = () => saveProduct(id);
}

function renderImagePreview() {
  const el = document.getElementById("pImagesPreview");
  const hintEl = document.getElementById("pImageHint");
  if (!el) return;
  el.innerHTML = modalImages.map((url, i) => `
    <div class="thumb-slot">
      <img src="${url}">
      <button type="button" class="thumb-remove" onclick="removeModalImage(${i})">✕</button>
    </div>
  `).join("");
  const fileInput = document.getElementById("pImage");
  if (fileInput) fileInput.disabled = modalImages.length >= MAX_IMAGES;
  if (hintEl) {
    hintEl.textContent = modalImages.length >= MAX_IMAGES
      ? `Já tem ${MAX_IMAGES} fotos (o máximo). Remova uma para adicionar outra.`
      : `${modalImages.length}/${MAX_IMAGES} fotos adicionadas.`;
  }
}

function removeModalImage(index) {
  modalImages.splice(index, 1);
  renderImagePreview();
}

async function handleImageSelect(e) {
  const files = Array.from(e.target.files || []);
  const errEl = document.getElementById("pError");
  errEl.textContent = "";

  const remaining = MAX_IMAGES - modalImages.length;
  const toUpload = files.slice(0, remaining);

  for (const file of toUpload) {
    try {
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await sb.storage.from("produtos").upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = sb.storage.from("produtos").getPublicUrl(path);
      modalImages.push(urlData.publicUrl);
      renderImagePreview();
    } catch (err) {
      errEl.textContent = "Erro ao enviar foto: " + err.message;
    }
  }
  e.target.value = "";
}

function closeModal() { modalRoot.innerHTML = ""; modalImages = []; }

async function saveProduct(id) {
  const name = document.getElementById("pName").value.trim();
  const category = document.getElementById("pCategory").value;
  const price = parseFloat(document.getElementById("pPrice").value);
  const stock = parseInt(document.getElementById("pStock").value, 10);
  const description = document.getElementById("pDesc").value.trim();
  const errEl = document.getElementById("pError");

  if (!name || isNaN(price) || isNaN(stock)) {
    errEl.textContent = "Preencha nome, preço e stock corretamente.";
    return;
  }
  if (modalImages.length === 0) {
    errEl.textContent = "Adicione pelo menos 1 foto do produto.";
    return;
  }

  const btn = document.getElementById("saveProductBtn");
  btn.disabled = true;
  btn.textContent = "A guardar...";

  try {
    const payload = {
      name, category, price, stock, description,
      image_urls: modalImages,
      image_url: modalImages[0] // mantido para compatibilidade
    };

    if (id) {
      const { error } = await sb.from("products").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await sb.from("products").insert(payload);
      if (error) throw error;
    }

    closeModal();
    loadProducts();
  } catch (e) {
    errEl.textContent = "Erro: " + e.message;
    btn.disabled = false;
    btn.textContent = id ? "Guardar" : "Adicionar";
  }
}

async function deleteProduct(id) {
  if (!confirm("Apagar este produto? Esta ação não pode ser desfeita.")) return;
  await sb.from("products").delete().eq("id", id);
  loadProducts();
}

// ---------- Início ----------
checkSession();
