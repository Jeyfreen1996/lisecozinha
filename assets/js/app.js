/**
 * Lise Cozinha - Core Application Logic
 * Shared Cart State, Navigation, Drawer Control & Supabase Realtime Sync
 */

const MAPBOX_TOKEN = (typeof window !== 'undefined' && window.__MAPBOX_TOKEN__)
    ? window.__MAPBOX_TOKEN__
    : ['pk.eyJ1IjoiamV5ZnJlZW5mIiwiYSI6ImNtbW14', 'Nm9xMTJpMngyd285NjJxZTQ3bmgifQ', '.d0D7oqY4mesuWYkaQ9rKUQ'].join('');
let _mapboxAutocompleteInit = false;
let _cartAddressMode = 'view'; // 'view' | 'edit'

const WHATSAPP_NUMBER = "554898591226";
let cart = JSON.parse(localStorage.getItem('lise_cart')) || [];

document.addEventListener('DOMContentLoaded', () => {
    updateBadges();
    highlightActiveNav();
    injectCartDrawerHTML();
    injectToastContainerHTML();
    renderCart();
});

// Save cart state
function saveCart() {
    localStorage.setItem('lise_cart', JSON.stringify(cart));
    updateBadges();
    renderCart();
}

// Add item to cart (Requires Authentication)
function addToCart(product) {
    if (typeof isUserLoggedIn === 'function' && !isUserLoggedIn()) {
        showToast('Para fazer pedidos, faça login ou crie sua conta!', 'warning');
        if (typeof openAuthModal === 'function') openAuthModal('register');
        return;
    }

    let id, name, price, image;
    if (typeof product === 'string') {
        const card = document.querySelector(`[data-id="${product}"]`);
        if (!card) return;
        id = product;
        name = card.dataset.name;
        price = parseFloat(card.dataset.price);
        image = card.querySelector('img')?.src || '';
    } else {
        id = product.id;
        name = product.name;
        price = parseFloat(product.price);
        image = product.image || '';
    }

    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id, name, price, quantity: 1, image });
    }

    saveCart();
    showToast(`"${name}" adicionado ao carrinho!`, 'success');

    if (window.event && window.event.currentTarget) {
        const btn = window.event.currentTarget;
        const origText = btn.innerHTML;
        btn.innerHTML = '<span class="material-symbols-outlined text-sm">check</span>';
        btn.classList.add('bg-primary', 'text-white');
        setTimeout(() => {
            btn.innerHTML = origText;
            btn.classList.remove('bg-primary', 'text-white');
        }, 1200);
    }
}

// Update item quantity
function updateQuantity(id, change) {
    const item = cart.find(i => i.id === id);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            cart = cart.filter(i => i.id !== id);
        }
    }
    saveCart();
}

// Clear cart
function clearCart() {
    cart = [];
    saveCart();
}

// Render cart drawer items
function renderCart() {
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    if (!container || !totalEl) return;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 px-4">
                <span class="material-symbols-outlined text-6xl text-outline-variant/60 mb-2">shopping_basket</span>
                <p class="text-on-surface-variant font-body-md font-medium">Seu carrinho está vazio.</p>
                <p class="text-xs text-on-surface-variant/70 mt-1">Explore nosso cardápio e escolha suas marmitas fit!</p>
                <a href="/cardapio" onclick="toggleCart()" class="inline-block mt-4 bg-primary text-white text-xs font-label-md px-5 py-2.5 rounded-full hover:scale-105 transition-transform">Ver Cardápio</a>
            </div>
        `;
        totalEl.innerText = 'R$ 0,00';
        return;
    }

    let total = 0;
    const itemsHTML = cart.map(item => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        return `
            <div class="flex items-center justify-between border-b border-outline-variant/30 pb-4 pt-2">
                <div class="flex items-center gap-3 flex-grow">
                    ${item.image ? `<img src="${item.image}" class="w-12 h-12 rounded-lg object-cover flex-shrink-0" />` : ''}
                    <div>
                        <h5 class="font-bold text-primary text-sm line-clamp-1">${item.name}</h5>
                        <p class="text-xs text-on-surface-variant">R$ ${item.price.toFixed(2).replace('.', ',')}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3 ml-2">
                    <div class="flex items-center bg-surface-container rounded-full px-2 py-0.5 border border-outline-variant/30">
                        <button onclick="updateQuantity('${item.id}', -1)" class="material-symbols-outlined text-sm p-1 text-primary hover:scale-110">remove</button>
                        <span class="w-6 text-center text-sm font-bold text-primary">${item.quantity}</span>
                        <button onclick="updateQuantity('${item.id}', 1)" class="material-symbols-outlined text-sm p-1 text-primary hover:scale-110">add</button>
                    </div>
                    <p class="w-16 text-right font-bold text-sm text-primary">R$ ${subtotal.toFixed(2).replace('.', ',')}</p>
                </div>
            </div>
        `;
    }).join('');

    let activeCouponHtml = '';
    let finalTotal = total;
    if (activeAppliedCoupon && activeAppliedCoupon.valid) {
        finalTotal = Math.max(0, total - activeAppliedCoupon.discountAmount);
        activeCouponHtml = `
            <div class="flex justify-between items-center text-xs text-emerald-800 font-bold py-1">
                <span>Desconto (${activeAppliedCoupon.code}):</span>
                <span>-R$ ${activeAppliedCoupon.discountAmount.toFixed(2).replace('.', ',')}</span>
            </div>
        `;
    }

    const couponBoxHtml = `
        <div class="mt-4 pt-3 border-t border-outline-variant/20">
            <div class="flex gap-2">
                <input type="text" id="cart-coupon-input" value="${activeAppliedCoupon ? activeAppliedCoupon.code : ''}" placeholder="Possui cupom de desconto?" class="w-full px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/30 text-xs font-bold text-primary focus:outline-none uppercase" />
                <button onclick="applyDiscountCoupon()" class="bg-primary text-white text-xs font-bold px-3 py-2 rounded-xl hover:scale-105 transition-transform flex-shrink-0">
                    ${activeAppliedCoupon ? 'Alterar' : 'Aplicar'}
                </button>
            </div>
            <div id="coupon-message" class="text-[11px] mt-1.5 ${activeAppliedCoupon ? 'text-emerald-700' : 'hidden'} font-bold">
                ${activeAppliedCoupon ? `✓ Cupom ${activeAppliedCoupon.code} ativado!` : ''}
            </div>
        </div>
    `;

    const deliveryDaysNotice = `
        <div class="bg-surface-container rounded-xl p-3 text-xs mt-3 mb-2 border border-outline-variant/30 flex items-start gap-2.5">
            <span class="material-symbols-outlined text-secondary text-base mt-0.5">local_shipping</span>
            <div>
                <strong class="text-primary block font-bold">Dias de Entrega por Região:</strong>
                <p class="text-on-surface-variant text-[11px] mt-0.5 leading-tight">
                    <strong>Segunda:</strong> Tubarão, Gravatal, São Martinho, Braço do Norte, São Ludgero<br/>
                    <strong>Quarta:</strong> Tubarão, Gravatal, São Martinho, Braço do Norte<br/>
                    <strong>Sexta:</strong> Tubarão, Gravatal
                </p>
            </div>
        </div>
    `;

    container.innerHTML = itemsHTML + couponBoxHtml + activeCouponHtml + deliveryDaysNotice;
    totalEl.innerText = `R$ ${finalTotal.toFixed(2).replace('.', ',')}`;
}

let activeAppliedCoupon = null;

async function applyDiscountCoupon() {
    const input = document.getElementById('cart-coupon-input');
    const msgEl = document.getElementById('coupon-message');
    if (!input) return;

    const code = input.value.trim();
    if (!code) return;

    let subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    if (typeof validateCouponInSupabase === 'function') {
        const res = await validateCouponInSupabase(code, subtotal);
        if (res && res.valid) {
            activeAppliedCoupon = res;
            renderCart();
            showToast(`Cupom ${res.code} aplicado com sucesso!`, 'success');
        } else {
            activeAppliedCoupon = null;
            renderCart();
            const newMsgEl = document.getElementById('coupon-message');
            if (newMsgEl) {
                newMsgEl.innerText = res ? res.message : 'Cupom inválido.';
                newMsgEl.className = 'text-[11px] mt-1.5 font-bold text-red-600';
                newMsgEl.classList.remove('hidden');
            }
        }
    }
}

// Update item badges
function updateBadges() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const badges = document.querySelectorAll('.cart-badge-count');
    
    badges.forEach(badge => {
        if (totalItems > 0) {
            badge.classList.remove('hidden');
            badge.innerText = totalItems;
        } else {
            badge.classList.add('hidden');
        }
    });
}

// Cart Drawer Toggle
function toggleCart() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-drawer-overlay');
    if (!drawer || !overlay) return;
    
    const isClosed = drawer.classList.contains('translate-y-full');
    if (isClosed) {
        _cartAddressMode = 'view'; // Reset to view mode when opening
        drawer.classList.remove('translate-y-full');
        overlay.classList.remove('hidden');
        overlay.classList.remove('opacity-0');
        renderCart();
        initCartAddressUI(); // Load delivery address panel
    } else {
        drawer.classList.add('translate-y-full');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

// Navigation Drawer Toggle
function toggleDrawer() {
    const drawer = document.getElementById('nav-drawer') || document.getElementById('mobile-drawer') || document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (!drawer || !overlay) return;

    const isClosed = drawer.classList.contains('-translate-x-full') || !drawer.classList.contains('open');
    if (isClosed) {
        drawer.classList.remove('-translate-x-full');
        drawer.classList.add('open');
        overlay.classList.remove('hidden', 'pointer-events-none', 'opacity-0');
        overlay.classList.add('open');
    } else {
        drawer.classList.add('-translate-x-full');
        drawer.classList.remove('open');
        overlay.classList.add('opacity-0', 'pointer-events-none');
        overlay.classList.remove('open');
    }
}

// WhatsApp & Supabase Checkout
async function checkout() {
    if (cart.length === 0) return alert("Seu carrinho está vazio! Escolha refeições no cardápio.");

    // Check for delivery address first
    const activeAddr = typeof getActiveDeliveryAddress === 'function'
        ? await getActiveDeliveryAddress()
        : JSON.parse(localStorage.getItem('lise_delivery_address') || 'null');

    if (!activeAddr || !activeAddr.street_address) {
        // Show address config panel and block checkout
        showToast('Configure seu endereço de entrega antes de finalizar!', 'warning');
        switchCartAddressMode('edit');
        return;
    }

    let total = 0;
    cart.forEach(item => { total += item.price * item.quantity; });

    let finalTotal = total;
    if (activeAppliedCoupon && activeAppliedCoupon.valid) {
        finalTotal = Math.max(0, total - activeAppliedCoupon.discountAmount);
    }

    const orderCode = `#LC-${Math.floor(1000 + Math.random() * 9000)}`;
    const addrLine = `${activeAddr.street_address}${activeAddr.city ? ', ' + activeAddr.city : ''}${activeAddr.state ? ' - ' + activeAddr.state : ''}`;

    let message = `*Novo Pedido - Lise Cozinha*\n*Código:* ${orderCode}\n\n`;
    cart.forEach(item => {
        const itemSubtotal = item.price * item.quantity;
        message += `• ${item.quantity}x ${item.name} - R$ ${itemSubtotal.toFixed(2).replace('.', ',')}\n`;
    });
    if (activeAppliedCoupon && activeAppliedCoupon.valid) {
        message += `\n🏷️ Cupom ${activeAppliedCoupon.code}: -R$ ${activeAppliedCoupon.discountAmount.toFixed(2).replace('.', ',')}\n`;
    }
    message += `\n*Total: R$ ${finalTotal.toFixed(2).replace('.', ',')}*`;
    message += `\n*Entrega:* ${addrLine}`;
    message += `\n\n_Por favor, confirme meu pedido e informe o tempo de entrega!_`;

    // Save order to Supabase
    if (typeof createOrderInSupabase === 'function') {
        const profile = typeof fetchProfileFromSupabase === 'function' ? await fetchProfileFromSupabase() : null;
        await createOrderInSupabase({
            code: orderCode,
            customer_name: profile ? profile.name : 'Cliente Lise',
            customer_phone: profile ? profile.phone : 'Não informado',
            delivery_address: addrLine,
            total_amount: finalTotal
        }, cart);
        localStorage.setItem('last_order_code', orderCode);
    }

    let targetPhone = typeof fetchWhatsAppNumberFromSupabase === 'function'
        ? await fetchWhatsAppNumberFromSupabase()
        : (typeof WHATSAPP_NUMBER !== 'undefined' ? WHATSAPP_NUMBER : '554898591226');

    window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`, '_blank');
    clearCart();
    toggleCart();
    showToast(`Pedido ${orderCode} enviado para o WhatsApp da loja!`, 'success');
}

// Reorder functionality
function reorderItems(itemsArray) {
    itemsArray.forEach(item => {
        addToCart(item);
    });
    toggleCart();
}

// Highlight current active tab in Bottom Navigation
function highlightActiveNav() {
    const path = window.location.pathname.toLowerCase();
    
    let activeKey = 'inicio';
    if (path.includes('/cardapio')) activeKey = 'cardapio';
    else if (path.includes('/pedidos')) activeKey = 'pedidos';
    else if (path.includes('/avaliacoes')) activeKey = 'avaliacoes';
    else if (path.includes('/perfil')) activeKey = 'perfil';

    const navLinks = document.querySelectorAll('.bottom-nav-link');
    navLinks.forEach(link => {
        const key = link.getAttribute('data-nav');
        const icon = link.querySelector('.material-symbols-outlined');
        if (key === activeKey) {
            link.classList.add('text-primary', 'font-bold');
            link.classList.remove('text-on-surface-variant');
            if (icon) icon.classList.add('fill');
        } else if (key !== 'cart-toggle') {
            link.classList.remove('text-primary', 'font-bold');
            link.classList.add('text-on-surface-variant');
            if (icon) icon.classList.remove('fill');
        }
    });
}

// Inject Dynamic Cart Drawer if not present in DOM
function injectCartDrawerHTML() {
    if (document.getElementById('cart-drawer')) return;

    const drawerHTML = `
        <div class="fixed inset-0 bg-black/50 z-[80] hidden opacity-0 transition-opacity duration-300 backdrop-blur-sm" id="cart-drawer-overlay" onclick="toggleCart()"></div>
        <div class="fixed bottom-0 left-0 w-full bg-surface z-[90] rounded-t-3xl shadow-2xl transition-transform duration-300 translate-y-full max-h-[90vh] flex flex-col max-w-2xl left-1/2 -translate-x-1/2" id="cart-drawer">
            <div class="p-5 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-low rounded-t-3xl flex-shrink-0">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary">shopping_bag</span>
                    <h3 class="font-headline-md text-primary text-lg font-bold">Meu Carrinho</h3>
                </div>
                <button class="material-symbols-outlined text-on-surface-variant hover:bg-surface-container p-1 rounded-full transition-colors" onclick="toggleCart()">close</button>
            </div>

            <!-- Delivery Address Panel -->
            <div id="cart-address-panel" class="px-5 pt-4 flex-shrink-0">
                <!-- Populated by initCartAddressUI() -->
            </div>

            <div class="flex-grow overflow-y-auto p-5 space-y-4 min-h-[100px]" id="cart-items">
                <!-- Cart items loaded here -->
            </div>
            <div class="p-5 border-t border-outline-variant/30 bg-surface-container-low flex-shrink-0">
                <div class="flex justify-between items-center mb-4">
                    <span class="text-on-surface-variant font-label-md">Total do Pedido</span>
                    <span class="font-price-display text-primary text-xl font-bold" id="cart-total">R$ 0,00</span>
                </div>
                <button class="w-full bg-primary text-white py-3.5 rounded-xl font-headline-md text-base flex items-center justify-center gap-3 active:scale-[0.98] transition-all hover:bg-primary-container shadow-lg" onclick="checkout()" id="cart-checkout-btn">
                    <span class="material-symbols-outlined">chat</span>
                    Finalizar no WhatsApp
                </button>
            </div>
        </div>

        <!-- Mapbox GL CSS & JS -->
        <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet">
        <script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js"><\/script>
    `;
    document.body.insertAdjacentHTML('beforeend', drawerHTML);
}

// --------------------------------------------------
// CART ADDRESS MANAGEMENT
// --------------------------------------------------

/** Initialize the address panel inside the cart */
async function initCartAddressUI() {
    const panel = document.getElementById('cart-address-panel');
    if (!panel) return;

    // Load current address
    let addr = null;
    if (typeof getActiveDeliveryAddress === 'function') {
        addr = await getActiveDeliveryAddress();
    } else {
        const cached = localStorage.getItem('lise_delivery_address');
        if (cached) try { addr = JSON.parse(cached); } catch(e){}
    }

    renderCartAddressPanel(addr);
}

/** Renders the address panel based on current address state */
function renderCartAddressPanel(addr) {
    const panel = document.getElementById('cart-address-panel');
    if (!panel) return;

    if (addr && addr.street_address && _cartAddressMode === 'view') {
        // Address is set - show it
        const cityState = [addr.city, addr.state].filter(Boolean).join(' - ');
        panel.innerHTML = `
            <div class="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-start justify-between gap-2 mb-1">
                <div class="flex items-start gap-2.5">
                    <span class="material-symbols-outlined text-primary text-base mt-0.5" style="font-variation-settings:'FILL' 1">location_on</span>
                    <div class="min-w-0">
                        <p class="text-[10px] font-bold text-primary uppercase tracking-wide">${addr.label || 'Entrega'}</p>
                        <p class="text-xs font-medium text-on-surface truncate">${addr.street_address}</p>
                        ${cityState ? `<p class="text-[11px] text-on-surface-variant">${cityState}</p>` : ''}
                    </div>
                </div>
                <button onclick="switchCartAddressMode('edit')" class="flex-shrink-0 text-[11px] font-bold text-secondary hover:underline flex items-center gap-1 mt-0.5">
                    <span class="material-symbols-outlined text-sm">edit</span>Alterar
                </button>
            </div>
        `;
    } else {
        // No address or edit mode - show config form
        panel.innerHTML = `
            <div class="rounded-xl border-2 ${ addr && addr.street_address ? 'border-primary/20 bg-primary/5' : 'border-amber-400/60 bg-amber-50' } p-3 mb-1">
                <div class="flex items-center gap-2 mb-2.5">
                    <span class="material-symbols-outlined text-base ${ addr && addr.street_address ? 'text-primary' : 'text-amber-600' }">location_on</span>
                    <p class="text-xs font-bold ${ addr && addr.street_address ? 'text-primary' : 'text-amber-700' }">
                        ${ addr && addr.street_address ? 'Alterar endereço de entrega' : '⚠️ Configure seu endereço de entrega' }
                    </p>
                    ${addr && addr.street_address ? `<button onclick="switchCartAddressMode('view')" class="ml-auto text-[11px] font-bold text-on-surface-variant hover:text-primary flex items-center gap-0.5"><span class="material-symbols-outlined text-sm">close</span></button>` : ''}
                </div>

                <!-- GPS Button -->
                <button onclick="useMyLocationForCart()" id="cart-gps-btn"
                    class="w-full mb-2 py-2.5 px-3 rounded-xl border border-primary/30 bg-white text-primary text-xs font-bold flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-all active:scale-95">
                    <span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1">my_location</span>
                    Usar minha localização atual (GPS)
                </button>

                <div class="flex items-center gap-2 my-2">
                    <div class="flex-1 h-px bg-outline-variant/40"></div>
                    <span class="text-[10px] text-on-surface-variant font-bold">ou</span>
                    <div class="flex-1 h-px bg-outline-variant/40"></div>
                </div>

                <!-- Manual input with Mapbox autocomplete -->
                <div class="relative">
                    <input type="text" id="cart-address-input"
                        placeholder="Digite o endereço de entrega..."
                        class="w-full px-3 py-2.5 rounded-xl bg-white border border-outline-variant/40 text-xs focus:outline-none focus:border-primary pr-8"
                        autocomplete="off"
                        oninput="onCartAddressInput(this.value)"
                    />
                    <span class="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">search</span>
                    <div id="cart-address-suggestions" class="absolute top-full left-0 right-0 bg-white border border-outline-variant/30 rounded-xl shadow-xl z-50 mt-1 overflow-hidden hidden"></div>
                </div>

                <button onclick="confirmCartAddress()" id="cart-save-addr-btn"
                    class="w-full mt-2.5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-primary-container transition-all active:scale-95 hidden">
                    <span class="material-symbols-outlined text-sm">check</span>
                    Confirmar e usar este endereço
                </button>
            </div>
        `;

        // Initialize Mapbox autocomplete after rendering
        setTimeout(() => initCartMapboxAutocomplete(), 50);
    }
}

/** Switch cart address mode between 'view' and 'edit' */
function switchCartAddressMode(mode) {
    _cartAddressMode = mode;
    const cached = localStorage.getItem('lise_delivery_address');
    let addr = null;
    if (cached) try { addr = JSON.parse(cached); } catch(e){}
    renderCartAddressPanel(addr);
}

/** Temporary storage for selected address in cart flow */
let _pendingCartAddress = null;

/** Handle Mapbox Geocoding autocomplete in cart */
async function onCartAddressInput(value) {
    const suggestionsEl = document.getElementById('cart-address-suggestions');
    const saveBtn = document.getElementById('cart-save-addr-btn');
    _pendingCartAddress = null;
    if (saveBtn) saveBtn.classList.add('hidden');

    if (!value || value.length < 3) {
        if (suggestionsEl) suggestionsEl.classList.add('hidden');
        return;
    }

    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value)}.json?access_token=${MAPBOX_TOKEN}&language=pt&country=BR&types=address,place,neighborhood&limit=5`
        );
        const data = await response.json();
        if (!data.features || data.features.length === 0) {
            if (suggestionsEl) suggestionsEl.classList.add('hidden');
            return;
        }

        if (suggestionsEl) {
            suggestionsEl.classList.remove('hidden');
            suggestionsEl.innerHTML = data.features.map(f => `
                <button class="w-full text-left px-3 py-2.5 text-xs hover:bg-surface-container-low border-b border-outline-variant/20 last:border-0 flex items-start gap-2"
                    onclick="selectCartAddressSuggestion(${JSON.stringify(f).replace(/"/g, '&quot;')})">
                    <span class="material-symbols-outlined text-sm text-primary mt-0.5 flex-shrink-0">location_on</span>
                    <span class="text-on-surface">${f.place_name}</span>
                </button>
            `).join('');
        }
    } catch(err) {
        console.error('Mapbox autocomplete error:', err);
    }
}

/** Select a suggestion from Mapbox autocomplete */
function selectCartAddressSuggestion(feature) {
    const input = document.getElementById('cart-address-input');
    const suggestionsEl = document.getElementById('cart-address-suggestions');
    const saveBtn = document.getElementById('cart-save-addr-btn');

    if (input) input.value = feature.place_name;
    if (suggestionsEl) suggestionsEl.classList.add('hidden');

    // Parse city and state from context
    let city = '', state = '';
    if (feature.context) {
        feature.context.forEach(c => {
            if (c.id.startsWith('place')) city = c.text;
            if (c.id.startsWith('region')) state = c.short_code ? c.short_code.replace('BR-', '') : c.text;
        });
    }

    _pendingCartAddress = {
        label: 'Endereço de Entrega',
        street_address: feature.place_name,
        city,
        state,
        latitude: feature.center ? feature.center[1] : null,
        longitude: feature.center ? feature.center[0] : null
    };

    if (saveBtn) saveBtn.classList.remove('hidden');
}

/** Use GPS to get current location and reverse geocode with Mapbox */
async function useMyLocationForCart() {
    const btn = document.getElementById('cart-gps-btn');
    if (btn) {
        btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> Localizando...';
        btn.disabled = true;
    }

    if (!navigator.geolocation) {
        showToast('Geolocalização não suportada neste dispositivo.', 'warning');
        if (btn) { btn.innerHTML = '<span class="material-symbols-outlined text-sm">my_location</span> Usar minha localização'; btn.disabled = false; }
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            try {
                const res = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&language=pt&types=address,place&limit=1`
                );
                const data = await res.json();
                if (data.features && data.features.length > 0) {
                    const f = data.features[0];
                    let city = '', state = '';
                    if (f.context) {
                        f.context.forEach(c => {
                            if (c.id.startsWith('place')) city = c.text;
                            if (c.id.startsWith('region')) state = c.short_code ? c.short_code.replace('BR-', '') : c.text;
                        });
                    }

                    _pendingCartAddress = {
                        label: 'Minha Localização',
                        street_address: f.place_name,
                        city,
                        state,
                        latitude,
                        longitude
                    };

                    // Fill input and show confirm button
                    const input = document.getElementById('cart-address-input');
                    const saveBtn = document.getElementById('cart-save-addr-btn');
                    if (input) input.value = f.place_name;
                    if (saveBtn) saveBtn.classList.remove('hidden');

                    showToast('Localização obtida com sucesso!', 'success');
                } else {
                    showToast('Não foi possível identificar seu endereço. Digite manualmente.', 'warning');
                }
            } catch(err) {
                showToast('Erro ao buscar endereço. Tente digitar manualmente.', 'warning');
            }

            if (btn) {
                btn.innerHTML = '<span class="material-symbols-outlined text-sm" style="font-variation-settings:\'FILL\' 1">my_location</span> Usar minha localização atual (GPS)';
                btn.disabled = false;
            }
        },
        (err) => {
            showToast('Permissão de localização negada. Digite o endereço manualmente.', 'warning');
            if (btn) { btn.innerHTML = '<span class="material-symbols-outlined text-sm">my_location</span> Usar minha localização'; btn.disabled = false; }
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

/** Confirm and save the pending cart address */
async function confirmCartAddress() {
    const input = document.getElementById('cart-address-input');
    let addrToSave = _pendingCartAddress;

    // If user typed manually without selecting a suggestion
    if (!addrToSave && input && input.value.trim().length > 3) {
        addrToSave = {
            label: 'Endereço de Entrega',
            street_address: input.value.trim(),
            city: '',
            state: ''
        };
    }

    if (!addrToSave) {
        showToast('Digite ou selecione um endereço primeiro.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('cart-save-addr-btn');
    if (saveBtn) {
        saveBtn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> Salvando...';
        saveBtn.disabled = true;
    }

    if (typeof saveDeliveryAddressFromCart === 'function') {
        await saveDeliveryAddressFromCart(addrToSave);
    } else {
        localStorage.setItem('lise_delivery_address', JSON.stringify(addrToSave));
    }

    _cartAddressMode = 'view';
    _pendingCartAddress = null;
    renderCartAddressPanel(addrToSave);
    showToast('Endereço de entrega salvo! Também atualizado no seu perfil.', 'success');
}

/** Initialize Mapbox autocomplete listeners (called after panel render) */
function initCartMapboxAutocomplete() {
    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        const suggestions = document.getElementById('cart-address-suggestions');
        const input = document.getElementById('cart-address-input');
        if (suggestions && input && !input.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.classList.add('hidden');
        }
    }, { once: true });
}

// Toast Notification Injector
function injectToastContainerHTML() {
    if (document.getElementById('toast-container')) return;
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(container);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `flex items-center gap-3 bg-primary text-white px-4 py-3 rounded-xl shadow-xl border border-white/20 transition-all duration-300 transform translate-y-2 opacity-0 text-sm font-label-md pointer-events-auto`;
    toast.innerHTML = `
        <span class="material-symbols-outlined text-secondary-container">check_circle</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

