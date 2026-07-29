/**
 * Lise Cozinha - Core Application Logic
 * Shared Cart State, Navigation, Drawer Control & Supabase Realtime Sync
 */

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
        drawer.classList.remove('translate-y-full');
        overlay.classList.remove('hidden');
        overlay.classList.remove('opacity-0');
        renderCart();
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

    let total = 0;
    cart.forEach(item => { total += item.price * item.quantity; });
    const orderCode = `#LC-${Math.floor(1000 + Math.random() * 9000)}`;

    let message = `*Novo Pedido - Lise Cozinha*\n*Código:* ${orderCode}\n\n`;
    
    cart.forEach(item => {
        const itemSubtotal = item.price * item.quantity;
        message += `• ${item.quantity}x ${item.name} - R$ ${itemSubtotal.toFixed(2).replace('.', ',')}\n`;
    });

    message += `\n*Total: R$ ${total.toFixed(2).replace('.', ',')}*\n\n_Por favor, confirme meu pedido e informe o tempo de entrega!_`;

    // Save order directly into Supabase DB
    if (typeof createOrderInSupabase === 'function') {
        const profile = typeof fetchProfileFromSupabase === 'function' ? await fetchProfileFromSupabase() : null;
        const addresses = typeof fetchAddressesFromSupabase === 'function' ? await fetchAddressesFromSupabase() : null;
        const defaultAddr = addresses && addresses.length > 0 ? addresses[0].street_address : 'Endereço a confirmar';

        await createOrderInSupabase({
            code: orderCode,
            customer_name: profile ? profile.name : 'Cliente Lise',
            customer_phone: profile ? profile.phone : 'Não informado',
            delivery_address: defaultAddr,
            total_amount: total
        }, cart);

        localStorage.setItem('last_order_code', orderCode);
    }

    // Retrieve configured store WhatsApp number dynamically from Supabase
    let targetPhone = typeof fetchWhatsAppNumberFromSupabase === 'function' 
        ? await fetchWhatsAppNumberFromSupabase() 
        : (typeof WHATSAPP_NUMBER !== 'undefined' ? WHATSAPP_NUMBER : '554898591226');

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${targetPhone}?text=${encodedMessage}`, '_blank');

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
        <div class="fixed bottom-0 left-0 w-full bg-surface z-[90] rounded-t-3xl shadow-2xl transition-transform duration-300 translate-y-full max-h-[85vh] flex flex-col max-w-2xl left-1/2 -translate-x-1/2" id="cart-drawer">
            <div class="p-5 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-low rounded-t-3xl">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary">shopping_bag</span>
                    <h3 class="font-headline-md text-primary text-lg font-bold">Meu Carrinho</h3>
                </div>
                <button class="material-symbols-outlined text-on-surface-variant hover:bg-surface-container p-1 rounded-full transition-colors" onclick="toggleCart()">close</button>
            </div>
            <div class="flex-grow overflow-y-auto p-5 space-y-4 min-h-[140px]" id="cart-items">
                <!-- Cart items loaded here -->
            </div>
            <div class="p-5 border-t border-outline-variant/30 bg-surface-container-low">
                <div class="flex justify-between items-center mb-4">
                    <span class="text-on-surface-variant font-label-md">Total do Pedido</span>
                    <span class="font-price-display text-primary text-xl font-bold" id="cart-total">R$ 0,00</span>
                </div>
                <button class="w-full bg-primary text-white py-3.5 rounded-xl font-headline-md text-base flex items-center justify-center gap-3 active:scale-[0.98] transition-all hover:bg-primary-container shadow-lg" onclick="checkout()">
                    <span class="material-symbols-outlined">chat</span>
                    Finalizar no WhatsApp
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', drawerHTML);
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

