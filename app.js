// ============================================
// ESQUINA DE VENDA MB — lógica da loja
// ============================================

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORIES = ["Roupas", "Acessórios", "Eletrodomésticos"];
let products = [];
let cart = []; // { id, name, price, image_url, qty, stock }

const shelvesEl = document.getElementById("shelves");
const cartCountEl = document.getElementById("cartCount");
const cartBodyEl = document.getElementById("cartBody");
const cartFooterEl = document.getElementById("cartFooter");
const overlayEl = document.getElementById("overlay");
const drawerEl = document.getElementById("cartDrawer");

function money(n) {
  return Number(n).toLocaleString("pt-AO", { minimumFractionDigits: 0 }) + " Kz";
}

// ---------- Carregar produtos ----------
async function loadProducts() {
  const { data, error } = await sb.from("products").select("*").order("created_at", { ascending: false });
  if (error) {
    shelvesEl.innerHTML = `<p style="text-align:center;padding:40px;color:#B23A2E;">
      Não foi possível carregar os produtos. Verifique a configuração em config.js.<br>
      <small>${error.message}</small></p>`;
    return;
  }
  products = data || [];
  renderShelves();
}

function renderShelves() {
  shelvesEl.innerHTML = "";
  CATEGORIES.forEach(cat => {
    const items = products.filter(p => p.category === cat);
    const section = document.createElement("section");
    section.className = "shelf";
    section.innerHTML = `
      <div class="shelf-header"><h2>${cat}</h2><div class="rule"></div></div>
      ${items.length === 0
        ? `<p class="empty-note">Ainda sem produtos nesta categoria.</p>`
        : `<div class="grid">${items.map(cardHtml).join("")}</div>`}
    `;
    shelvesEl.appendChild(section);
  });
}

function cardHtml(p) {
  const outOfStock = p.stock <= 0;
  return `
    <div class="card">
      <div class="img-wrap">
        ${p.image_url
          ? `<img src="${p.image_url}" alt="${escapeHtml(p.name)}">`
          : `<span class="placeholder">SEM FOTO</span>`}
      </div>
      <div class="body">
        <div class="name">${escapeHtml(p.name)}</div>
        ${p.description ? `<div class="desc">${escapeHtml(p.description)}</div>` : ""}
        <span class="price-tag">${money(p.price)}</span>
        <span class="stock-note ${outOfStock ? "low" : ""}">
          ${outOfStock ? "Esgotado" : p.stock <= 3 ? `Últimas ${p.stock} unidades` : "Em stock"}
        </span>
        <button class="add-btn" ${outOfStock ? "disabled" : ""} onclick="addToCart('${p.id}')">
          ${outOfStock ? "Esgotado" : "Adicionar ao carrinho"}
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

// ---------- Carrinho ----------
function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const existing = cart.find(c => c.id === id);
  if (existing) {
    if (existing.qty < p.stock) existing.qty++;
  } else {
    cart.push({ id: p.id, name: p.name, price: p.price, image_url: p.image_url, qty: 1, stock: p.stock });
  }
  renderCart();
  openCart();
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(c => c.id !== id);
  } else if (item.qty > item.stock) {
    item.qty = item.stock;
  }
  renderCart();
}

function removeItem(id) {
  cart = cart.filter(c => c.id !== id);
  renderCart();
}

function cartTotal() {
  return cart.reduce((sum, c) => sum + c.price * c.qty, 0);
}

function renderCart() {
  cartCountEl.textContent = cart.reduce((n, c) => n + c.qty, 0);

  if (cart.length === 0) {
    cartBodyEl.innerHTML = `<p class="empty-note">O seu carrinho está vazio.</p>`;
    cartFooterEl.innerHTML = "";
    return;
  }

  cartBodyEl.innerHTML = cart.map(c => `
    <div class="cart-item">
      <div class="thumb">${c.image_url ? `<img src="${c.image_url}">` : ""}</div>
      <div class="info">
        <div class="n">${escapeHtml(c.name)}</div>
        <div class="p">${money(c.price)}</div>
        <div class="qty-controls">
          <button onclick="changeQty('${c.id}', -1)">−</button>
          <span>${c.qty}</span>
          <button onclick="changeQty('${c.id}', 1)" ${c.qty >= c.stock ? "disabled" : ""}>+</button>
        </div>
        <button class="remove-link" onclick="removeItem('${c.id}')">Remover</button>
      </div>
    </div>
  `).join("");

  cartFooterEl.innerHTML = `
    <div class="total-row"><span class="label">Total</span><span class="value">${money(cartTotal())}</span></div>
    <button class="btn-primary" onclick="openCheckout()">Finalizar encomenda</button>
  `;
}

function openCart() { overlayEl.classList.add("open"); drawerEl.classList.add("open"); }
function closeCart() { overlayEl.classList.remove("open"); drawerEl.classList.remove("open"); }
document.getElementById("openCart").onclick = openCart;
document.getElementById("closeCart").onclick = closeCart;
overlayEl.onclick = closeCart;

// ---------- Checkout ----------
function openCheckout() {
  cartBodyEl.innerHTML = `
    <div class="payment-box">
      <strong>Como pagar:</strong><br>
      Faça a transferência de <strong>${money(cartTotal())}</strong> via Multicaixa Express para:<br>
      <strong>${NUMERO_PAGAMENTO}</strong> (${NOME_TITULAR_CONTA})<br>
      Depois, envie o comprovativo abaixo para confirmarmos a sua encomenda.
    </div>
    <div class="field">
      <label>Nome completo</label>
      <input type="text" id="ckName" placeholder="O seu nome">
    </div>
    <div class="field">
      <label>Número de telemóvel</label>
      <input type="tel" id="ckPhone" placeholder="9XX XXX XXX">
    </div>
    <div class="field">
      <label>Morada / local de entrega</label>
      <textarea id="ckAddress" rows="2" placeholder="Bairro, referência..."></textarea>
    </div>
    <div class="field">
      <label>Comprovativo de pagamento (foto ou captura de ecrã)</label>
      <input type="file" id="ckProof" accept="image/*">
      <div class="hint">Aceite apenas depois de confirmarmos o pagamento.</div>
    </div>
    <div id="ckError" class="error-msg"></div>
  `;
  cartFooterEl.innerHTML = `
    <button class="btn-primary" id="submitOrder">Enviar encomenda</button>
    <button class="btn-secondary" onclick="renderCart()">Voltar ao carrinho</button>
  `;
  document.getElementById("submitOrder").onclick = submitOrder;
}

async function submitOrder() {
  const name = document.getElementById("ckName").value.trim();
  const phone = document.getElementById("ckPhone").value.trim();
  const address = document.getElementById("ckAddress").value.trim();
  const proofFile = document.getElementById("ckProof").files[0];
  const errEl = document.getElementById("ckError");
  errEl.textContent = "";

  if (!name || !phone || !proofFile) {
    errEl.textContent = "Preencha o nome, telemóvel e anexe o comprovativo.";
    return;
  }

  const btn = document.getElementById("submitOrder");
  btn.disabled = true;
  btn.textContent = "A enviar...";

  try {
    // Upload do comprovativo
    const fileExt = proofFile.name.split(".").pop();
    const filePath = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { error: uploadError } = await sb.storage.from("comprovativos").upload(filePath, proofFile);
    if (uploadError) throw uploadError;

    const { data: urlData } = sb.storage.from("comprovativos").getPublicUrl(filePath);

    const { error: orderError } = await sb.from("orders").insert({
      customer_name: name,
      phone,
      address,
      items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty })),
      total: cartTotal(),
      proof_url: urlData.publicUrl,
      status: "pendente"
    });
    if (orderError) throw orderError;

    cart = [];
    cartBodyEl.innerHTML = `
      <div class="confirm-box">
        <div class="icon">✅</div>
        <h3>Encomenda enviada!</h3>
        <p>Vamos confirmar o seu pagamento e entraremos em contacto pelo número ${escapeHtml(phone)} assim que for aprovado.</p>
      </div>
    `;
    cartFooterEl.innerHTML = `<button class="btn-primary" onclick="closeCart(); renderCart();">Fechar</button>`;
    cartCountEl.textContent = "0";
  } catch (e) {
    errEl.textContent = "Erro ao enviar: " + e.message;
    btn.disabled = false;
    btn.textContent = "Enviar encomenda";
  }
}

// ---------- Início ----------
loadProducts();
renderCart();
