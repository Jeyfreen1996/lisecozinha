
    let adminOrders = [];
    let adminProducts = [];
    let adminCategories = [];
    let adminCoupons = [];

    function checkAdminAuthView() {
        const loginScreen = document.getElementById('admin-login-screen');
        const appLayout = document.getElementById('admin-app-layout');
        const currentAdmin = getCurrentAdmin();

        if (!currentAdmin) {
            loginScreen.classList.remove('hidden');
            appLayout.classList.add('hidden');
        } else {
            loginScreen.classList.add('hidden');
            appLayout.classList.remove('hidden');
            const displayEl = document.getElementById('admin-user-display');
            if (displayEl) displayEl.innerText = currentAdmin.name || 'Admin';
            loadAdminData();
        }
    }

    async function handleAdminLogin(e) {
        e.preventDefault();
        const email = document.getElementById('admin-login-email').value;
        const pass = document.getElementById('admin-login-password').value;

        const res = await loginAdminInSupabase(email, pass);
        if (res) {
            showToast(`Bem-vindo, ${res.name}!`, 'success');
            checkAdminAuthView();
        } else {
            alert('E-mail ou senha incorretos! Tente novamente.');
        }
    }

    function switchAdminTab(tabId, btnEl) {
        document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.admin-nav-btn').forEach(btn => {
            btn.classList.remove('bg-white/10', 'text-white');
            btn.classList.add('text-white/80');
        });

        const target = document.getElementById('tab-' + tabId);
        if (target) target.classList.remove('hidden');

        if (btnEl) {
            btnEl.classList.remove('text-white/80');
            btnEl.classList.add('bg-white/10', 'text-white');
        }

        const titles = {
            'overview': 'Visão Geral & Indicadores',
            'orders': 'Gestão de Pedidos en Tempo Real',
            'products': 'Gerenciamento do Cardápio',
            'categories': 'Gestão de Categorias',
            'coupons': 'Gestão de Cupons de Desconto',
            'customers': 'Clientes Cadastrados',
            'reviews': 'Gestão de Avaliações',
            'admins': 'Configurações & Administradores',
            'settings': 'Configurações da Loja',
            'reports': 'Relatórios & Fechamento de Caixa'
        };
        document.getElementById('admin-tab-title').innerText = titles[tabId] || 'Painel de Gerenciamento';

        if (tabId === 'settings') {
            initSettingsTab();
        } else if (tabId === 'reports') {
            initReportsTab();
        }
    }

    async function loadAdminData() {
        // Parallel data loading for maximum speed & instant realtime sync
        const [
            ordersRes,
            productsRes,
            categoriesRes,
            couponsRes,
            customersRes,
            reviewsRes,
            adminsRes,
            whatsappRes
        ] = await Promise.allSettled([
            typeof fetchAllOrdersForAdmin === 'function' ? fetchAllOrdersForAdmin() : Promise.resolve([]),
            typeof fetchProductsFromSupabase === 'function' ? fetchProductsFromSupabase() : Promise.resolve([]),
            typeof fetchCategoriesFromSupabase === 'function' ? fetchCategoriesFromSupabase() : Promise.resolve([]),
            typeof fetchCouponsFromSupabase === 'function' ? fetchCouponsFromSupabase() : Promise.resolve([]),
            typeof fetchAllProfilesForAdmin === 'function' ? fetchAllProfilesForAdmin() : Promise.resolve([]),
            typeof fetchReviewsFromSupabase === 'function' ? fetchReviewsFromSupabase() : Promise.resolve([]),
            typeof fetchAllAdminsFromSupabase === 'function' ? fetchAllAdminsFromSupabase() : Promise.resolve([]),
            typeof fetchWhatsAppNumberFromSupabase === 'function' ? fetchWhatsAppNumberFromSupabase() : Promise.resolve('554898591226')
        ]);

        adminOrders = (ordersRes.status === 'fulfilled' && ordersRes.value) ? ordersRes.value : [];
        renderAdminOrders();

        adminProducts = (productsRes.status === 'fulfilled' && productsRes.value) ? productsRes.value : [];
        renderAdminProducts();

        adminCategories = (categoriesRes.status === 'fulfilled' && categoriesRes.value) ? categoriesRes.value : [];
        renderAdminCategories();

        adminCoupons = (couponsRes.status === 'fulfilled' && couponsRes.value) ? couponsRes.value : [];
        renderAdminCoupons();

        const customers = (customersRes.status === 'fulfilled' && customersRes.value) ? customersRes.value : [];
        renderAdminCustomers(customers);

        const reviews = (reviewsRes.status === 'fulfilled' && reviewsRes.value) ? reviewsRes.value : [];
        renderAdminReviews(reviews);

        const admins = (adminsRes.status === 'fulfilled' && adminsRes.value) ? adminsRes.value : [];
        renderAdminList(admins);

        if (whatsappRes.status === 'fulfilled' && whatsappRes.value) {
            const input = document.getElementById('admin-whatsapp-number');
            if (input) input.value = whatsappRes.value;
        }

        // Update Overview Metrics: sum ONLY paid/confirmed orders for total revenue
        const paidStatuses = ['preparando', 'saiu_entrega', 'entregue', 'confirmed', 'cooking', 'delivering', 'delivered'];
        const totalRevenue = adminOrders
            .filter(o => paidStatuses.includes(o.status))
            .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);

        const activeCount = adminOrders.filter(o => ['aguardando_pagamento', 'preparando', 'saiu_entrega', 'pending', 'confirmed', 'cooking', 'delivering'].includes(o.status)).length;

        document.getElementById('metric-revenue').innerText = `R$ ${totalRevenue.toFixed(2).replace('.', ',')}`;
        document.getElementById('metric-active-orders').innerText = activeCount;
        document.getElementById('metric-customers').innerText = customers.length;
        document.getElementById('metric-products').innerText = adminProducts.length;

        // Cashbox: sum of paid orders for today; reset to 0 if all orders deleted or cashbox zeroed
        const cashboxEl = document.getElementById('metric-cashbox');
        if (cashboxEl) {
            const todayStr = new Date().toISOString().split('T')[0];
            const paidTodaySum = adminOrders
                .filter(o => {
                    const isPaid = ['preparando', 'saiu_entrega', 'entregue', 'confirmed', 'cooking', 'delivering', 'delivered'].includes(o.status);
                    if (!isPaid) return false;
                    if (!o.created_at) return true;
                    const orderDate = new Date(o.created_at).toISOString().split('T')[0];
                    return orderDate === todayStr;
                })
                .reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);

            let cashboxVal = adminOrders.length === 0 ? 0 : paidTodaySum;
            if (typeof fetchSettingsFromSupabase === 'function') {
                fetchSettingsFromSupabase().then(s => {
                    const savedCashbox = parseFloat(s['cashbox_total'] || '0');
                    if (savedCashbox === 0 || adminOrders.length === 0) {
                        cashboxVal = 0;
                    }
                    cashboxEl.innerText = `R$ ${cashboxVal.toFixed(2).replace('.', ',')}`;
                });
            } else {
                cashboxEl.innerText = `R$ ${cashboxVal.toFixed(2).replace('.', ',')}`;
            }
        }
    }

    async function handleSaveWhatsAppNumber(e) {
        e.preventDefault();
        const input = document.getElementById('admin-whatsapp-number');
        if (!input) return;
        const val = input.value;

        if (typeof updateWhatsAppNumberInSupabase === 'function') {
            const ok = await updateWhatsAppNumberInSupabase(val);
            if (ok) {
                showToast('Número de WhatsApp atualizado no Supabase!', 'success');
            } else {
                alert('Erro ao salvar número de WhatsApp.');
            }
        }
    }

    function renderAdminOrders() {
        const overviewBody = document.getElementById('overview-orders-table');
        const fullBody = document.getElementById('full-orders-table');

        if (!adminOrders || adminOrders.length === 0) {
            const emptyHTML = `<tr><td colspan="7" class="py-6 text-center text-on-surface-variant italic">Nenhum pedido registrado até o momento.</td></tr>`;
            if (overviewBody) overviewBody.innerHTML = emptyHTML;
            if (fullBody) fullBody.innerHTML = emptyHTML;
            return;
        }

        const renderRows = (limit = null) => {
            const list = limit ? adminOrders.slice(0, limit) : adminOrders;
            return list.map(o => {
                const addrLine = [o.delivery_address, o.address_complement].filter(Boolean).join(' — ');

                let itemsList = [];
                if (Array.isArray(o.order_items) && o.order_items.length > 0) {
                    itemsList = o.order_items.map(i => `${i.quantity}x ${i.product_name}`);
                } else if (Array.isArray(o.items)) {
                    itemsList = o.items.map(i => `${i.quantity || 1}x ${i.name || i.product_name}`);
                } else if (typeof o.items === 'string') {
                    try {
                        const parsed = JSON.parse(o.items);
                        if (Array.isArray(parsed)) itemsList = parsed.map(i => `${i.quantity || 1}x ${i.name || i.product_name}`);
                    } catch(e) {}
                }

                const itemsSummary = itemsList.length > 0
                    ? itemsList.join(', ')
                    : '<span class="italic text-on-surface-variant/70">Marmitas Fit</span>';

                return `
                <tr class="hover:bg-surface-container/50 ${o.status === 'aguardando_pagamento' || o.status === 'pending' ? 'bg-yellow-50/50' : ''}">
                    <td class="py-3 px-3 font-bold text-primary">${o.code}</td>
                    <td class="py-3 px-3">
                        <span class="font-bold text-primary block">${o.customer_name}</span>
                        <span class="text-[11px] text-on-surface-variant">${o.customer_phone}</span>
                    </td>
                    <td class="py-3 px-3 max-w-[220px]">
                        <span class="block text-xs font-bold text-primary break-words leading-snug">${itemsSummary}</span>
                    </td>
                    <td class="py-3 px-3 text-on-surface-variant max-w-[160px]">
                        <span class="block text-xs break-words leading-snug">${addrLine || '--'}</span>
                    </td>
                    <td class="py-3 px-3 font-bold text-primary">R$ ${parseFloat(o.total_amount).toFixed(2).replace('.', ',')}</td>
                    <td class="py-3 px-3">
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${getStatusBadgeClass(o.status)}">
                            ${getStatusLabel(o.status)}
                        </span>
                    </td>
                    <td class="py-3 px-3 text-right">
                        ${getNextStatusButtons(o)}
                    </td>
                </tr>
            `}).join('');
        };

        if (overviewBody) overviewBody.innerHTML = renderRows(5);
        if (fullBody) fullBody.innerHTML = renderRows();
    }

    function getStatusBadgeClass(status) {
        switch (status) {
            case 'aguardando_pagamento': return 'bg-yellow-100 text-yellow-800';
            case 'preparando': return 'bg-amber-100 text-amber-800';
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'confirmed': return 'bg-blue-100 text-blue-800';
            case 'cooking': return 'bg-amber-100 text-amber-800';
            case 'saiu_entrega': return 'bg-purple-100 text-purple-800';
            case 'delivering': return 'bg-purple-100 text-purple-800';
            case 'entregue': return 'bg-emerald-100 text-emerald-800';
            case 'delivered': return 'bg-emerald-100 text-emerald-800';
            case 'cancelado': return 'bg-red-100 text-red-800';
            case 'cancelled': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    function getStatusLabel(status) {
        switch (status) {
            case 'aguardando_pagamento': return '💳 Aguardando Pagamento';
            case 'preparando': return '🍳 Preparando na Cozinha';
            case 'saiu_entrega': return '🛵 Saiu p/ Entrega';
            case 'entregue': return '✅ Entregue';
            case 'cancelado': return '❌ Cancelado';
            // Legacy
            case 'pending': return '💳 Aguardando Pagamento';
            case 'confirmed': return '✔️ Confirmado';
            case 'cooking': return '🍳 Preparando';
            case 'delivering': return '🛵 Saiu p/ Entrega';
            case 'delivered': return '✅ Entregue';
            case 'cancelled': return '❌ Cancelado';
            default: return status;
        }
    }

    function getNextStatusButtons(order) {
        const s = order.status;
        const id = order.id;
        const amount = parseFloat(order.total_amount || 0);
        const isPaid = ['preparando', 'saiu_entrega', 'entregue', 'cooking', 'delivering', 'delivered'].includes(s);

        if (s === 'cancelado' || s === 'cancelled') {
            return `
                <div class="inline-flex items-center gap-1.5">
                    <span class="text-[10px] text-red-600 font-bold">Cancelado</span>
                    <button onclick="handleDeleteCancelledOrder('${id}', '${order.code}')" class="px-2 py-1 bg-red-600 text-white rounded font-bold text-xs hover:bg-red-700 flex items-center gap-0.5 shadow-sm" title="Excluir Pedido">
                        <span class="material-symbols-outlined text-xs">delete</span>Excluir
                    </button>
                </div>
            `;
        }

        if (s === 'entregue' || s === 'delivered') {
            return `
                <div class="inline-flex items-center gap-1.5">
                    <span class="text-[10px] text-emerald-700 font-bold">✅ Entregue</span>
                    <button onclick="printOrderReceipt('${id}')" title="Imprimir Comanda" class="px-2 py-1 bg-surface-container text-primary rounded font-bold text-xs hover:bg-surface-container-high flex items-center gap-0.5"><span class="material-symbols-outlined text-xs">print</span>Imprimir</button>
                    <button onclick="handleDeleteCancelledOrder('${id}', '${order.code}')" class="px-2 py-1 bg-red-600 text-white rounded font-bold text-xs hover:bg-red-700 flex items-center gap-0.5 shadow-sm" title="Excluir Pedido">
                        <span class="material-symbols-outlined text-xs">delete</span>Excluir
                    </button>
                </div>
            `;
        }

        let html = '<div class="inline-flex flex-wrap gap-1">';

        if (s === 'aguardando_pagamento' || s === 'pending') {
            html += `<button onclick="confirmOrderPayment('${id}', ${amount})" class="px-2 py-1 bg-emerald-100 text-emerald-800 rounded font-bold text-xs hover:bg-emerald-200 flex items-center gap-0.5"><span class="material-symbols-outlined text-xs">payments</span>Confirmar Pagto</button>`;
        }
        if (s === 'preparando' || s === 'confirmed' || s === 'cooking') {
            html += `<button onclick="changeOrderStatus('${id}', 'saiu_entrega')" class="px-2 py-1 bg-purple-100 text-purple-800 rounded font-bold text-xs hover:bg-purple-200">Saiu p/ Entrega</button>`;
        }
        if (s === 'saiu_entrega' || s === 'delivering') {
            html += `<button onclick="changeOrderStatus('${id}', 'entregue')" class="px-2 py-1 bg-emerald-100 text-emerald-800 rounded font-bold text-xs hover:bg-emerald-200">✅ Entregue</button>`;
        }

        // Print button
        html += `<button onclick="printOrderReceipt('${id}')" title="Imprimir Comanda" class="px-2 py-1 bg-surface-container text-primary rounded font-bold text-xs hover:bg-surface-container-high flex items-center gap-0.5"><span class="material-symbols-outlined text-xs">print</span>Imprimir</button>`;

        // Cancel button
        html += `<button onclick="cancelOrder('${id}', ${isPaid ? amount : 0})" class="px-2 py-1 bg-red-50 text-red-700 rounded font-bold text-xs hover:bg-red-100">Cancelar</button>`;

        html += '</div>';
        return html;
    }

    async function changeOrderStatus(orderId, newStatus) {
        if (typeof updateOrderStatusInSupabase === 'function') {
            const ok = await updateOrderStatusInSupabase(orderId, newStatus);
            if (ok) {
                showToast(`Status atualizado: ${getStatusLabel(newStatus)}!`, 'success');
                loadAdminData();
            }
        }
    }

    /** Confirm payment: change status to preparando + sum to cashbox */
    async function confirmOrderPayment(orderId, amount) {
        if (!confirm(`Confirmar pagamento de R$ ${amount.toFixed(2).replace('.', ',')}? O valor será somado à caixa.`)) return;

        const ok1 = typeof updateOrderStatusInSupabase === 'function'
            ? await updateOrderStatusInSupabase(orderId, 'preparando')
            : false;

        if (ok1 && typeof updateCashboxInSupabase === 'function') {
            await updateCashboxInSupabase(amount);
        }

        showToast(`💰 Pagamento confirmado! R$ ${amount.toFixed(2).replace('.', ',')} somado à caixa.`, 'success');
        loadAdminData();
    }

    /** Cancel order: change to cancelado + deduct if already paid */
    async function cancelOrder(orderId, paidAmount) {
        const msg = paidAmount > 0
            ? `Cancelar pedido? R$ ${paidAmount.toFixed(2).replace('.', ',')} será descontado da caixa (já foi pago).`
            : 'Cancelar pedido?';
        if (!confirm(msg)) return;

        const ok1 = typeof updateOrderStatusInSupabase === 'function'
            ? await updateOrderStatusInSupabase(orderId, 'cancelado')
            : false;

        if (ok1 && paidAmount > 0 && typeof updateCashboxInSupabase === 'function') {
            await updateCashboxInSupabase(-paidAmount);
        }

        showToast(`Pedido cancelado.${paidAmount > 0 ? ' Valor removido da caixa.' : ''}`, 'success');
        loadAdminData();
    }

    function renderAdminProducts() {
        const grid = document.getElementById('admin-products-grid');
        if (!grid) return;

        if (adminProducts.length === 0) {
            grid.innerHTML = '<p class="text-xs text-on-surface-variant italic col-span-full">Nenhum prato cadastrado.</p>';
            return;
        }

        grid.innerHTML = adminProducts.map(p => `
            <div class="bg-surface-container-lowest p-4 rounded-2xl organic-shadow border border-outline-variant/30 flex flex-col justify-between">
                <div>
                    <div class="h-36 rounded-xl overflow-hidden mb-3 relative">
                        <img src="${p.image_url}" class="w-full h-full object-cover"/>
                        <span class="absolute top-2 left-2 bg-primary text-white text-[10px] px-2 py-0.5 rounded-full font-bold">${p.category_slug}</span>
                        ${p.is_highlight ? '<span class="absolute top-2 right-2 bg-secondary text-white text-[9px] px-2 py-0.5 rounded-full font-bold">Destaque</span>' : ''}
                    </div>
                    <h4 class="font-bold text-primary text-sm mb-1">${p.name}</h4>
                    <p class="text-[11px] text-on-surface-variant line-clamp-2 mb-3">${p.description}</p>
                </div>
                <div class="flex justify-between items-center pt-3 border-t border-outline-variant/20">
                    <span class="font-bold text-primary text-base">R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}</span>
                    <div class="flex items-center gap-1">
                        <button onclick="openEditProductModal('${p.id}')" class="text-primary hover:bg-surface-container px-2.5 py-1.5 rounded-xl transition-colors font-bold text-xs flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">edit</span> Editar
                        </button>
                        <button onclick="handleDeleteProduct('${p.id}')" class="text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-xl transition-colors font-bold text-xs flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">delete</span>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function renderAdminCategories() {
        const body = document.getElementById('admin-categories-table');
        if (!body) return;

        if (adminCategories.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-on-surface-variant italic font-bold">Nenhuma categoria cadastrada no momento. Clique em "Nova Categoria" para adicionar.</td></tr>';
            return;
        }

        body.innerHTML = adminCategories.map(c => `
            <tr class="hover:bg-surface-container/50">
                <td class="py-3 px-3"><span class="material-symbols-outlined text-primary">${c.icon_name || 'restaurant'}</span></td>
                <td class="py-3 px-3 font-bold text-primary">${c.name}</td>
                <td class="py-3 px-3 text-on-surface-variant font-mono">${c.slug}</td>
                <td class="py-3 px-3 text-on-surface-variant max-w-xs truncate">${c.description || '--'}</td>
                <td class="py-3 px-3 text-right">
                    <div class="inline-flex gap-1">
                        <button onclick="openEditCategoryModal('${c.id}')" class="text-primary hover:bg-surface-container px-2 py-1 rounded font-bold text-xs">Editar</button>
                        <button onclick="handleDeleteCategory('${c.id}')" class="text-red-600 hover:bg-red-50 px-2 py-1 rounded font-bold text-xs">Excluir</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function renderAdminCoupons() {
        const body = document.getElementById('admin-coupons-table');
        if (!body) return;

        if (adminCoupons.length === 0) {
            body.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-on-surface-variant italic font-bold">Nenhum cupom de desconto cadastrado no momento. Clique em "Criar Novo Cupom" para adicionar.</td></tr>';
            return;
        }

        body.innerHTML = adminCoupons.map(cp => {
            const valStr = cp.discount_type === 'percentage' ? `${cp.discount_value}%` : `R$ ${parseFloat(cp.discount_value).toFixed(2).replace('.', ',')}`;
            const minStr = cp.min_order_amount > 0 ? `R$ ${parseFloat(cp.min_order_amount).toFixed(2).replace('.', ',')}` : 'Sem mínimo';

            return `
                <tr class="hover:bg-surface-container/50">
                    <td class="py-3 px-3 font-bold text-primary uppercase font-mono">${cp.code}</td>
                    <td class="py-3 px-3 text-on-surface-variant">${cp.discount_type === 'percentage' ? 'Porcentagem' : 'Valor Fixo'}</td>
                    <td class="py-3 px-3 font-bold text-emerald-700">${valStr}</td>
                    <td class="py-3 px-3 text-on-surface-variant">${minStr}</td>
                    <td class="py-3 px-3">
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${cp.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">
                            ${cp.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                    </td>
                    <td class="py-3 px-3 text-right">
                        <div class="inline-flex gap-1">
                            <button onclick="openEditCouponModal('${cp.id}')" class="text-primary hover:bg-surface-container px-2 py-1 rounded font-bold text-xs">Editar</button>
                            <button onclick="handleDeleteCoupon('${cp.id}')" class="text-red-600 hover:bg-red-50 px-2 py-1 rounded font-bold text-xs">Excluir</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function handleDeleteProduct(id) {
        if (confirm("Deseja realmente remover este prato do Supabase?")) {
            const ok = await deleteProductInSupabase(id);
            if (ok) {
                showToast('Prato removido!');
                loadAdminData();
            }
        }
    }

    async function handleDeleteCategory(id) {
        if (confirm("Remover esta categoria do Supabase?")) {
            const ok = await deleteCategoryInSupabase(id);
            if (ok) {
                showToast('Categoria removida!');
                loadAdminData();
            }
        }
    }

    async function handleDeleteCoupon(id) {
        if (confirm("Remover este cupom do Supabase?")) {
            const ok = await deleteCouponInSupabase(id);
            if (ok) {
                showToast('Cupom removido!');
                loadAdminData();
            }
        }
    }

    function renderAdminCustomers(customers) {
        const body = document.getElementById('admin-customers-table');
        if (!body) return;

        if (customers.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-on-surface-variant italic">Nenhum cliente cadastrado ainda.</td></tr>';
            return;
        }

        body.innerHTML = customers.map(c => `
            <tr class="hover:bg-surface-container/50">
                <td class="py-3 px-3 font-bold text-primary">${c.name}</td>
                <td class="py-3 px-3 text-on-surface-variant">${c.phone || '--'}</td>
                <td class="py-3 px-3 text-on-surface-variant">${c.email}</td>
                <td class="py-3 px-3"><span class="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">Ativo</span></td>
                <td class="py-3 px-3 text-on-surface-variant text-[11px]">${new Date(c.created_at || Date.now()).toLocaleDateString('pt-BR')}</td>
            </tr>
        `).join('');
    }

    function renderAdminReviews(reviews) {
        const grid = document.getElementById('admin-reviews-grid');
        if (!grid) return;

        if (reviews.length === 0) {
            grid.innerHTML = '<p class="text-xs text-on-surface-variant italic col-span-full">Nenhuma avaliação recebida.</p>';
            return;
        }

        grid.innerHTML = reviews.map(r => `
            <div class="bg-surface-container-lowest p-5 rounded-2xl organic-shadow border border-outline-variant/30 flex flex-col justify-between">
                <div>
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-bold text-primary text-sm">${r.customer_name}</span>
                        <span class="text-secondary font-bold text-xs">${'★'.repeat(r.rating)}</span>
                    </div>
                    <p class="text-xs text-on-surface-variant mb-4">"${r.comment}"</p>
                </div>
                <div class="flex justify-between items-center pt-3 border-t border-outline-variant/20">
                    <span class="text-[10px] text-on-surface-variant">${new Date(r.created_at || Date.now()).toLocaleDateString('pt-BR')}</span>
                    <button onclick="handleDeleteReview('${r.id}')" class="text-red-600 hover:bg-red-50 p-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">delete</span> Excluir
                    </button>
                </div>
            </div>
        `).join('');
    }

    async function handleDeleteReview(id) {
        if (confirm("Remover esta avaliação do Supabase?")) {
            const ok = await deleteReviewInSupabase(id);
            if (ok) {
                showToast('Avaliação removida!');
                loadAdminData();
            }
        }
    }

    function renderAdminList(admins) {
        const body = document.getElementById('admins-list-table');
        if (!body) return;

        if (admins.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-on-surface-variant italic">Nenhum administrador encontrado.</td></tr>';
            return;
        }

        body.innerHTML = admins.map(a => `
            <tr class="hover:bg-surface-container/50">
                <td class="py-3 px-3 font-bold text-primary">${a.name}</td>
                <td class="py-3 px-3 text-on-surface-variant">${a.email}</td>
                <td class="py-3 px-3"><span class="bg-secondary/10 text-secondary text-[10px] font-bold px-2 py-0.5 rounded-full">${a.role || 'Admin'}</span></td>
                <td class="py-3 px-3 text-on-surface-variant text-[11px]">${new Date(a.created_at || Date.now()).toLocaleDateString('pt-BR')}</td>
                <td class="py-3 px-3 text-right">
                    ${a.email !== 'admin@lisecozinha.com.br' ? `
                        <button onclick="handleDeleteAdmin('${a.id}')" class="text-red-600 hover:bg-red-50 px-2 py-1 rounded font-bold text-xs">Excluir</button>
                    ` : '<span class="text-[10px] text-on-surface-variant italic">Mestre</span>'}
                </td>
            </tr>
        `).join('');
    }

    async function handleCreateAdminSubmit(e) {
        e.preventDefault();
        const name = document.getElementById('admin-new-name').value;
        const email = document.getElementById('admin-new-email').value;
        const pass = document.getElementById('admin-new-pass').value;

        const res = await createAdminInSupabase(name, email, pass);
        if (res) {
            showToast(`Administrador "${name}" criado com sucesso!`, 'success');
            document.getElementById('admin-new-name').value = '';
            document.getElementById('admin-new-email').value = '';
            document.getElementById('admin-new-pass').value = '';
            loadAdminData();
        } else {
            alert('Erro ao criar administrador no Supabase.');
        }
    }

    async function handleDeleteAdmin(adminId) {
        if (confirm("Deseja realmente revogar o acesso deste administrador?")) {
            const ok = await deleteAdminFromSupabase(adminId);
            if (ok) {
                showToast('Administrador removido!');
                loadAdminData();
            }
        }
    }

    // Category Modal functions
    function openNewCategoryModal() {
        document.getElementById('cat-id').value = '';
        document.getElementById('cat-modal-title').innerText = 'Cadastrar Categoria';
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-slug').value = '';
        document.getElementById('cat-icon').value = 'restaurant';
        document.getElementById('cat-desc').value = '';

        const modal = document.getElementById('category-modal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    function openEditCategoryModal(catId) {
        const cat = adminCategories.find(c => c.id === catId);
        if (!cat) return;

        document.getElementById('cat-id').value = cat.id;
        document.getElementById('cat-modal-title').innerText = 'Editar Categoria';
        document.getElementById('cat-name').value = cat.name;
        document.getElementById('cat-slug').value = cat.slug;
        document.getElementById('cat-icon').value = cat.icon_name || 'restaurant';
        document.getElementById('cat-desc').value = cat.description || '';

        const modal = document.getElementById('category-modal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    function closeCategoryModal() {
        const modal = document.getElementById('category-modal');
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }

    async function handleCategorySubmit(e) {
        e.preventDefault();
        const id = document.getElementById('cat-id').value;
        const name = document.getElementById('cat-name').value;
        const slug = document.getElementById('cat-slug').value;
        const icon = document.getElementById('cat-icon').value;
        const desc = document.getElementById('cat-desc').value;

        const catData = { name, slug, icon_name: icon, description: desc };
        let res = id ? await updateCategoryInSupabase(id, catData) : await addCategoryInSupabase(catData);

        if (res && res.length > 0) {
            closeCategoryModal();
            showToast(id ? `Categoria "${name}" atualizada!` : `Categoria "${name}" criada com sucesso!`, 'success');
            loadAdminData();
        } else {
            alert('Erro ao salvar categoria no Supabase. Verifique se o slug ou nome já existe.');
        }
    }

    // Coupon Modal functions
    function openNewCouponModal() {
        document.getElementById('coup-id').value = '';
        document.getElementById('coup-modal-title').innerText = 'Cadastrar Cupom de Desconto';
        document.getElementById('coup-code').value = '';
        document.getElementById('coup-type').value = 'percentage';
        document.getElementById('coup-value').value = '';
        document.getElementById('coup-min').value = '0';
        document.getElementById('coup-active').checked = true;

        const modal = document.getElementById('coupon-modal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    function openEditCouponModal(coupId) {
        const coup = adminCoupons.find(cp => cp.id === coupId);
        if (!coup) return;

        document.getElementById('coup-id').value = coup.id;
        document.getElementById('coup-modal-title').innerText = 'Editar Cupom de Desconto';
        document.getElementById('coup-code').value = coup.code;
        document.getElementById('coup-type').value = coup.discount_type || 'percentage';
        document.getElementById('coup-value').value = coup.discount_value;
        document.getElementById('coup-min').value = coup.min_order_amount || 0;
        document.getElementById('coup-active').checked = !!coup.is_active;

        const modal = document.getElementById('coupon-modal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    function closeCouponModal() {
        const modal = document.getElementById('coupon-modal');
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }

    async function handleCouponSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('coup-id').value;
        const code = document.getElementById('coup-code').value;
        const type = document.getElementById('coup-type').value;
        const value = document.getElementById('coup-value').value;
        const min = document.getElementById('coup-min').value;
        const active = document.getElementById('coup-active').checked;

        const coupData = { code, discount_type: type, discount_value: value, min_order_amount: min, is_active: active };
        let res = id ? await updateCouponInSupabase(id, coupData) : await addCouponInSupabase(coupData);

        if (res) {
            closeCouponModal();
            showToast(id ? `Cupom "${code}" atualizado!` : `Cupom "${code}" criado!`, 'success');
            loadAdminData();
        } else {
            alert('Erro ao salvar cupom no Supabase.');
        }
    }

    function openNewProductModal() {
        document.getElementById('prod-id').value = '';
        document.getElementById('prod-modal-title').innerText = 'Cadastrar Novo Prato';
        document.getElementById('prod-submit-btn').innerText = 'Salvar Prato no Supabase';
        document.getElementById('prod-name').value = '';
        document.getElementById('prod-desc').value = '';
        document.getElementById('prod-price').value = '';
        document.getElementById('prod-cat').value = 'Fit';
        document.getElementById('prod-badge').value = 'Fit & Proteico';
        document.getElementById('prod-img').value = '';
        document.getElementById('prod-highlight').checked = false;
        document.getElementById('image-preview-container').classList.add('hidden');

        const modal = document.getElementById('new-product-modal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    function openEditProductModal(productId) {
        const prod = adminProducts.find(p => p.id === productId);
        if (!prod) return;

        document.getElementById('prod-id').value = prod.id;
        document.getElementById('prod-modal-title').innerText = 'Editar Prato';
        document.getElementById('prod-submit-btn').innerText = 'Atualizar Prato no Supabase';
        document.getElementById('prod-name').value = prod.name;
        document.getElementById('prod-desc').value = prod.description;
        document.getElementById('prod-price').value = prod.price;
        document.getElementById('prod-cat').value = prod.category_slug || 'Fit';
        document.getElementById('prod-badge').value = prod.badge || '';
        document.getElementById('prod-img').value = prod.image_url || '';
        document.getElementById('prod-highlight').checked = !!prod.is_highlight;

        updateImagePreview(prod.image_url);

        const modal = document.getElementById('new-product-modal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }

    function closeNewProductModal() {
        const modal = document.getElementById('new-product-modal');
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }

    function handleDeviceFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Data = e.target.result;
            document.getElementById('prod-img').value = base64Data;
            updateImagePreview(base64Data);
            showToast('Foto carregada do dispositivo!', 'success');
        };
        reader.readAsDataURL(file);
    }

    function updateImagePreview(url) {
        const container = document.getElementById('image-preview-container');
        const img = document.getElementById('image-preview-img');
        if (url && url.length > 5) {
            img.src = url;
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    }

    async function handleProductSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('prod-id').value;
        const name = document.getElementById('prod-name').value;
        const desc = document.getElementById('prod-desc').value;
        const price = document.getElementById('prod-price').value;
        const cat = document.getElementById('prod-cat').value;
        const badge = document.getElementById('prod-badge').value;
        const img = document.getElementById('prod-img').value;
        const highlight = document.getElementById('prod-highlight').checked;

        const productData = {
            name,
            description: desc,
            price,
            category_slug: cat,
            badge: badge || cat,
            image_url: img || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
            is_highlight: highlight
        };

        let res = false;
        if (id) {
            res = await updateProductInSupabase(id, productData);
        } else {
            res = await addProductInSupabase(productData);
        }

        if (res) {
            closeNewProductModal();
            showToast(id ? `Prato "${name}" atualizado!` : `Prato "${name}" cadastrado!`, 'success');
            loadAdminData();
        } else {
            alert('Erro ao salvar prato no Supabase.');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        checkAdminAuthView();

        // Always init hours days UI immediately (doesn't need auth or Supabase)
        initHoursDays({});

        // New order sound notification via Realtime
        let _knownOrderIds = new Set();
        if (typeof subscribeToOrdersRealtime === 'function') {
            subscribeToOrdersRealtime((payload) => {
                if (isAdminLoggedIn()) {
                    loadAdminData();
                    // Notify only for brand-new inserts
                    if (payload && payload.eventType === 'INSERT') {
                        const soundEnabled = document.getElementById('cfg-sound-enabled');
                        if (!soundEnabled || soundEnabled.checked) {
                            playOrderNotification();
                        }
                        showNewOrderBanner(payload.new);
                    }
                }
            });
        }

        initSettingsTab();
    });

    // =============================================
    // SOUND NOTIFICATION
    // =============================================
    let _titleBlinkInterval = null;

    function playOrderNotification() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            const playBeep = (delay, freq = 880, duration = 0.18) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
                gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + delay + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + duration + 0.05);
            };

            // 3 beeps
            playBeep(0, 880);
            playBeep(0.28, 1100);
            playBeep(0.56, 880);
            playBeep(0.84, 1100);
            playBeep(1.12, 1320);

        } catch(e) { console.warn('Audio notification failed:', e); }

        // Blink page title
        if (_titleBlinkInterval) clearInterval(_titleBlinkInterval);
        const origTitle = document.title;
        let blink = 0;
        _titleBlinkInterval = setInterval(() => {
            document.title = blink % 2 === 0 ? '\u26a1 NOVO PEDIDO!' : origTitle;
            blink++;
            if (blink > 14) {
                clearInterval(_titleBlinkInterval);
                document.title = origTitle;
                _titleBlinkInterval = null;
            }
        }, 600);
    }

    function showNewOrderBanner(order) {
        const banner = document.createElement('div');
        banner.className = 'fixed top-4 right-4 z-[200] bg-primary text-white px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce border border-white/20';
        banner.innerHTML = `
            <span class="material-symbols-outlined text-secondary text-2xl" style="font-variation-settings:'FILL' 1">notifications_active</span>
            <div>
                <p class="font-bold text-sm">⚡ Novo Pedido Recebido!</p>
                <p class="text-xs text-white/80">${order ? order.customer_name + ' — R$ ' + parseFloat(order.total_amount || 0).toFixed(2).replace('.', ',') : ''}</p>
            </div>
            <button onclick="this.parentElement.remove()" class="ml-2 text-white/70 hover:text-white">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        `;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 8000);
    }

    // =============================================
    // THERMAL PRINT RECEIPT
    // =============================================
    async function printOrderReceipt(orderId) {
        const order = adminOrders.find(o => o.id === orderId);
        if (!order) { alert('Pedido não encontrado.'); return; }

        // Read receipt config
        let cfg = {};
        if (typeof fetchSettingsFromSupabase === 'function') {
            const s = await fetchSettingsFromSupabase();
            try { cfg = s['receipt_config'] ? JSON.parse(s['receipt_config']) : {}; } catch(e) {}
        }

        const storeName = cfg.name || 'Lise Cozinha Fit';
        const footer = cfg.footer || 'Obrigada pela preferência! ♥';
        const showAddress = cfg.show_address !== false;
        const showQty = cfg.show_qty !== false;
        const showCode = cfg.show_code !== false;

        let items = [];
        if (Array.isArray(order.order_items) && order.order_items.length > 0) {
            items = order.order_items.map(i => ({
                name: i.product_name || i.name || 'Item',
                quantity: i.quantity || 1,
                price: i.price || 0
            }));
        } else if (Array.isArray(order.items)) {
            items = order.items.map(i => ({
                name: i.name || i.product_name || 'Item',
                quantity: i.quantity || 1,
                price: i.price || 0
            }));
        } else if (typeof order.items === 'string') {
            try {
                const parsed = JSON.parse(order.items);
                if (Array.isArray(parsed)) {
                    items = parsed.map(i => ({
                        name: i.name || i.product_name || 'Item',
                        quantity: i.quantity || 1,
                        price: i.price || 0
                    }));
                }
            } catch(e) {}
        }

        const now = new Date().toLocaleString('pt-BR');
        const sep = '-'.repeat(32);

        let receiptHTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Comanda #${order.code}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; width: 72mm; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; margin: 2px 0; }
  .big { font-size: 15px; font-weight: bold; }
  .sm { font-size: 10px; }
</style>
</head>
<body>
<div class="center bold big">${storeName}</div>
<div class="center sm">Cozinha Saudável</div>
<div class="sep"></div>`;

        if (showCode) {
            receiptHTML += `<div class="center sm">Pedido: <b>#${order.code}</b></div>`;
        }
        receiptHTML += `<div class="center sm">${now}</div>`;
        receiptHTML += `<div class="center bold">${order.customer_name}</div>`;
        receiptHTML += `<div class="center sm">${order.customer_phone}</div>`;
        receiptHTML += `<div class="sep"></div>`;
        receiptHTML += `<div class="bold">ITENS:</div>`;

        if (items.length > 0) {
            items.forEach(item => {
                const price = parseFloat(item.price || 0);
                const qty = item.quantity || 1;
                const total = price * qty;
                receiptHTML += `<div class="row">`;
                if (showQty) {
                    receiptHTML += `<span>${qty}x ${item.name}</span><span>R$${total.toFixed(2).replace('.',',')}</span>`;
                } else {
                    receiptHTML += `<span>${item.name}</span><span>R$${total.toFixed(2).replace('.',',')}</span>`;
                }
                receiptHTML += `</div>`;
            });
        } else {
            receiptHTML += `<div class="sm">Itens não disponíveis</div>`;
        }

        receiptHTML += `<div class="sep"></div>`;
        receiptHTML += `<div class="row bold big"><span>TOTAL</span><span>R$${parseFloat(order.total_amount).toFixed(2).replace('.',',')}</span></div>`;
        receiptHTML += `<div class="sep"></div>`;

        if (showAddress && order.delivery_address) {
            receiptHTML += `<div class="bold">ENTREGA:</div>`;
            receiptHTML += `<div class="sm">${order.delivery_address}</div>`;
            if (order.address_complement) {
                receiptHTML += `<div class="sm">${order.address_complement}</div>`;
            }
            receiptHTML += `<div class="sep"></div>`;
        }

        receiptHTML += `<div class="center sm">${footer}</div>`;
        receiptHTML += `</body></html>`;

        const win = window.open('', '_blank', 'width=340,height=600');
        win.document.write(receiptHTML);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 500);
    }

    // =============================================
    // SETTINGS TAB LOGIC
    // =============================================

    /** Generic save button state handler */
    function setSaveBtnState(btnId, state) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const origMap = {
            'btn-save-delivery': '<span class="material-symbols-outlined text-sm">save</span> Salvar Taxa de Entrega',
            'btn-save-hours': '<span class="material-symbols-outlined text-sm">save</span> Salvar Horários',
            'btn-save-receipt': '<span class="material-symbols-outlined text-sm">save</span> Salvar Config. de Comanda',
            'btn-save-sound': '<span class="material-symbols-outlined text-sm">save</span> Salvar Preferências de Som',
            'btn-save-pix': '<span class="material-symbols-outlined text-sm">save</span> Salvar Chave Pix',
            'btn-save-pass': '<span class="material-symbols-outlined text-sm">vpn_key</span> Alterar Senha de Exclusão'
        };
        if (state === 'saving') {
            btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> Salvando...';
            btn.disabled = true;
        } else if (state === 'saved') {
            btn.innerHTML = '<span class="material-symbols-outlined text-sm">check_circle</span> Salvo com sucesso!';
            btn.classList.add('bg-emerald-600');
            btn.disabled = false;
            setTimeout(() => { btn.innerHTML = origMap[btnId] || 'Salvar'; btn.classList.remove('bg-emerald-600'); }, 2500);
        } else if (state === 'error') {
            btn.innerHTML = '<span class="material-symbols-outlined text-sm">error</span> Erro ao salvar';
            btn.classList.add('bg-red-600');
            btn.disabled = false;
            setTimeout(() => { btn.innerHTML = origMap[btnId] || 'Salvar'; btn.classList.remove('bg-red-600'); }, 2500);
        }
    }

    function toggleDeliveryFeeField() {
        const type = document.getElementById('cfg-delivery-type')?.value;
        const field = document.getElementById('delivery-fee-field');
        if (field) field.classList.toggle('hidden', type === 'free');
    }

    async function saveDeliveryFeeConfig() {
        setSaveBtnState('btn-save-delivery', 'saving');
        try {
            const type = document.getElementById('cfg-delivery-type')?.value || 'fixed';
            const rawFee = document.getElementById('cfg-delivery-fee')?.value || '0';
            const cleanFee = rawFee.replace(',', '.').replace(/[^0-9.]/g, '') || '0';
            const value = { type, fee: type === 'free' ? '0' : cleanFee };

            if (typeof saveSettingInSupabase === 'function') {
                await saveSettingInSupabase('delivery_fee', JSON.stringify(value));
            } else {
                const cached = localStorage.getItem('lise_settings') || '{}';
                let s = {}; try { s = JSON.parse(cached); } catch(e) {}
                s['delivery_fee'] = JSON.stringify(value);
                localStorage.setItem('lise_settings', JSON.stringify(s));
            }
        } catch(e) {
            console.warn('saveDeliveryFeeConfig notice:', e);
        }
        setSaveBtnState('btn-save-delivery', 'saved');
    }

    const DAYS_PT = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const DAYS_EMO = ['☀️', '🟢', '🟢', '🟢', '🟢', '🟢', '🟡'];
    const DAYS_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    function initHoursDays(hoursData = {}) {
        const container = document.getElementById('hours-days-container');
        if (!container) return;
        container.innerHTML = DAYS_PT.map((label, i) => {
            const key = DAYS_KEY[i];
            const defaultOpen = i >= 1 && i <= 5; // Mon-Fri open by default
            const day = hoursData[key] || { open: defaultOpen, from: '09:00', to: '18:00' };
            const isOpen = day.open !== false && day.open !== undefined ? day.open : defaultOpen;
            return `
                <div class="flex items-center gap-2 py-1.5 border-b border-outline-variant/20 last:border-0">
                    <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
                        <input type="checkbox" id="day-${key}" ${isOpen ? 'checked' : ''}
                            class="sr-only peer"
                            onchange="document.getElementById('hours-row-${key}').classList.toggle('opacity-40', !this.checked)" />
                        <div class="w-8 h-4 bg-outline-variant/40 peer-focus:outline-none rounded-full peer peer-checked:bg-primary transition-all"></div>
                        <div class="absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-all peer-checked:translate-x-4"></div>
                    </label>
                    <div id="hours-row-${key}" class="flex items-center gap-2 flex-1 ${isOpen ? '' : 'opacity-40'}">
                        <span class="text-xs font-bold text-primary w-24 flex-shrink-0">${DAYS_EMO[i]} ${label}</span>
                        <div class="flex items-center gap-1.5 flex-1">
                            <input type="time" id="from-${key}" value="${day.from || '09:00'}"
                                class="flex-1 px-2 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs focus:outline-none focus:border-primary font-bold text-center" />
                            <span class="text-[10px] text-on-surface-variant font-bold">até</span>
                            <input type="time" id="to-${key}" value="${day.to || '18:00'}"
                                class="flex-1 px-2 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs focus:outline-none focus:border-primary font-bold text-center" />
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function applyHoursPreset(from, to) {
        DAYS_KEY.forEach(key => {
            const fromEl = document.getElementById(`from-${key}`);
            const toEl = document.getElementById(`to-${key}`);
            if (fromEl) fromEl.value = from;
            if (toEl) toEl.value = to;
        });
    }

    async function saveBusinessHoursConfig() {
        setSaveBtnState('btn-save-hours', 'saving');
        try {
            const hours = {};
            DAYS_KEY.forEach(key => {
                hours[key] = {
                    open: !!(document.getElementById(`day-${key}`)?.checked),
                    from: document.getElementById(`from-${key}`)?.value || '09:00',
                    to: document.getElementById(`to-${key}`)?.value || '18:00'
                };
            });
            if (typeof saveSettingInSupabase === 'function') {
                await saveSettingInSupabase('business_hours', JSON.stringify(hours));
            } else {
                const cached = localStorage.getItem('lise_settings') || '{}';
                let s = {}; try { s = JSON.parse(cached); } catch(e) {}
                s['business_hours'] = JSON.stringify(hours);
                localStorage.setItem('lise_settings', JSON.stringify(s));
            }
        } catch(e) {
            console.warn('saveBusinessHoursConfig notice:', e);
        }
        setSaveBtnState('btn-save-hours', 'saved');
    }

    async function saveReceiptConfig() {
        setSaveBtnState('btn-save-receipt', 'saving');
        try {
            const cfg = {
                name: document.getElementById('cfg-receipt-name')?.value || 'Lise Cozinha Fit',
                footer: document.getElementById('cfg-receipt-footer')?.value || 'Obrigada pela preferência!',
                show_address: !!(document.getElementById('cfg-receipt-address')?.checked),
                show_qty: !!(document.getElementById('cfg-receipt-qty')?.checked),
                show_code: !!(document.getElementById('cfg-receipt-code')?.checked)
            };
            if (typeof saveSettingInSupabase === 'function') {
                await saveSettingInSupabase('receipt_config', JSON.stringify(cfg));
            } else {
                const cached = localStorage.getItem('lise_settings') || '{}';
                let s = {}; try { s = JSON.parse(cached); } catch(e) {}
                s['receipt_config'] = JSON.stringify(cfg);
                localStorage.setItem('lise_settings', JSON.stringify(s));
            }
        } catch(e) {
            console.warn('saveReceiptConfig notice:', e);
        }
        setSaveBtnState('btn-save-receipt', 'saved');
    }

    async function saveSoundConfig() {
        setSaveBtnState('btn-save-sound', 'saving');
        try {
            const enabled = !!(document.getElementById('cfg-sound-enabled')?.checked);
            if (typeof saveSettingInSupabase === 'function') {
                await saveSettingInSupabase('sound_enabled', String(enabled));
            } else {
                const cached = localStorage.getItem('lise_settings') || '{}';
                let s = {}; try { s = JSON.parse(cached); } catch(e) {}
                s['sound_enabled'] = String(enabled);
                localStorage.setItem('lise_settings', JSON.stringify(s));
            }
        } catch(e) {
            console.warn('saveSoundConfig notice:', e);
        }
        setSaveBtnState('btn-save-sound', 'saved');
    }

    async function savePixConfig() {
        setSaveBtnState('btn-save-pix', 'saving');
        try {
            const type = document.getElementById('cfg-pix-type')?.value || 'Chave Pix';
            const key = document.getElementById('cfg-pix-key')?.value?.trim() || '';
            const holder = document.getElementById('cfg-pix-holder')?.value?.trim() || '';
            const pixData = { type, key, holder };

            if (typeof saveSettingInSupabase === 'function') {
                await saveSettingInSupabase('pix_config', JSON.stringify(pixData));
                await saveSettingInSupabase('pix_key', key);
            } else {
                const cached = localStorage.getItem('lise_settings') || '{}';
                let s = {}; try { s = JSON.parse(cached); } catch(e) {}
                s['pix_config'] = JSON.stringify(pixData);
                s['pix_key'] = key;
                localStorage.setItem('lise_settings', JSON.stringify(s));
            }
            localStorage.setItem('lise_pix_config', JSON.stringify(pixData));
        } catch(e) {
            console.warn('savePixConfig notice:', e);
        }
        setSaveBtnState('btn-save-pix', 'saved');
    }

    async function saveDeletePasswordConfig() {
        const currentInput = document.getElementById('cfg-pass-current')?.value;
        const newPass = document.getElementById('cfg-pass-new')?.value;
        const confirmPass = document.getElementById('cfg-pass-confirm')?.value;

        let settings = {};
        if (typeof fetchSettingsFromSupabase === 'function') {
            settings = await fetchSettingsFromSupabase() || {};
        }
        const currentSavedPass = settings['delete_order_password'] || '2606';

        if (currentInput !== currentSavedPass) {
            alert('Senha atual incorreta! Digite a senha correta (Padrão: 2606).');
            return;
        }

        if (!newPass || newPass.trim().length < 2) {
            alert('Digite uma nova senha válida.');
            return;
        }

        if (newPass !== confirmPass) {
            alert('A nova senha e a confirmação não coincidem.');
            return;
        }

        setSaveBtnState('btn-save-pass', 'saving');
        try {
            if (typeof saveSettingInSupabase === 'function') {
                await saveSettingInSupabase('delete_order_password', newPass.trim());
            } else {
                const cached = localStorage.getItem('lise_settings') || '{}';
                let s = {}; try { s = JSON.parse(cached); } catch(e) {}
                s['delete_order_password'] = newPass.trim();
                localStorage.setItem('lise_settings', JSON.stringify(s));
            }
            setSaveBtnState('btn-save-pass', 'saved');
            document.getElementById('cfg-pass-current').value = '';
            document.getElementById('cfg-pass-new').value = '';
            document.getElementById('cfg-pass-confirm').value = '';
            showToast('Senha de exclusão alterada com sucesso!', 'success');
        } catch(e) {
            console.warn('saveDeletePasswordConfig notice:', e);
            setSaveBtnState('btn-save-pass', 'saved');
        }
    }

    /** Delete cancelled order permanently with password confirmation */
    async function handleDeleteCancelledOrder(orderId, orderCode) {
        let settings = {};
        if (typeof fetchSettingsFromSupabase === 'function') {
            settings = await fetchSettingsFromSupabase() || {};
        }
        const targetPass = settings['delete_order_password'] || '2606';

        const inputPass = prompt(`Deseja excluir permanentemente o pedido ${orderCode}?\nDigite a senha de segurança (Padrão: 2606):`);
        if (inputPass === null) return; // User cancelled prompt

        if (inputPass.trim() !== targetPass) {
            alert('Senha incorreta! A exclusão do pedido foi cancelada.');
            return;
        }

        const ok = typeof deleteOrderFromSupabase === 'function'
            ? await deleteOrderFromSupabase(orderId)
            : true;

        if (ok) {
            adminOrders = adminOrders.filter(o => o.id !== orderId && o.code !== orderCode);
            renderAdminOrders();
            loadAdminData(); // Instantly update metrics (Vendas Totais, Pedidos Ativos)
            showToast(`Pedido ${orderCode} excluído permanentemente!`, 'success');
        } else {
            alert('Erro ao excluir pedido. Tente novamente.');
        }
    }

    async function initSettingsTab() {
        // Always render days first with defaults
        initHoursDays({});

        // Try to load saved settings from Supabase or localStorage
        let s = {};
        try {
            if (typeof fetchSettingsFromSupabase === 'function') {
                s = await fetchSettingsFromSupabase() || {};
            }
        } catch(e) {
            console.warn('initSettingsTab: error loading settings', e);
        }

        const localStr = localStorage.getItem('lise_settings');
        if (localStr) {
            try {
                const localS = JSON.parse(localStr);
                s = { ...localS, ...s };
            } catch(e) {}
        }

        // Delivery fee
        if (s['delivery_fee']) {
            try {
                const df = typeof s['delivery_fee'] === 'object' ? s['delivery_fee'] : JSON.parse(s['delivery_fee']);
                const typeEl = document.getElementById('cfg-delivery-type');
                const feeEl = document.getElementById('cfg-delivery-fee');
                if (typeEl) typeEl.value = df.type || 'fixed';
                if (feeEl) {
                    const cleanFee = String(df.fee || '0').replace(',', '.');
                    feeEl.value = parseFloat(cleanFee || '0').toFixed(2);
                }
                toggleDeliveryFeeField();
            } catch(e) {
                console.warn('initSettingsTab delivery_fee parse notice:', e);
            }
        }

        // Business hours
        if (s['business_hours']) {
            try {
                const hoursData = typeof s['business_hours'] === 'object' ? s['business_hours'] : JSON.parse(s['business_hours']);
                initHoursDays(hoursData);
            } catch(e) {}
        }

        // Receipt config
        if (s['receipt_config']) {
            try {
                const rc = typeof s['receipt_config'] === 'object' ? s['receipt_config'] : JSON.parse(s['receipt_config']);
                const n = document.getElementById('cfg-receipt-name');
                const f = document.getElementById('cfg-receipt-footer');
                const a = document.getElementById('cfg-receipt-address');
                const q = document.getElementById('cfg-receipt-qty');
                const c = document.getElementById('cfg-receipt-code');
                if (n) n.value = rc.name || '';
                if (f) f.value = rc.footer || '';
                if (a) a.checked = rc.show_address !== false;
                if (q) q.checked = rc.show_qty !== false;
                if (c) c.checked = rc.show_code !== false;
            } catch(e) {}
        }

        // Sound
        if (s['sound_enabled'] !== undefined) {
            const se = document.getElementById('cfg-sound-enabled');
            if (se) se.checked = String(s['sound_enabled']) !== 'false';
        }

        // Pix config
        if (s['pix_config'] || s['pix_key']) {
            try {
                const px = s['pix_config'] ? (typeof s['pix_config'] === 'object' ? s['pix_config'] : JSON.parse(s['pix_config'])) : {};
                const t = document.getElementById('cfg-pix-type');
                const k = document.getElementById('cfg-pix-key');
                const h = document.getElementById('cfg-pix-holder');
                if (t) t.value = px.type || 'CPF';
                if (k) k.value = px.key || s['pix_key'] || '';
                if (h) h.value = px.holder || '';
            } catch(e) {}
        }
    }

    // =============================================
    // REPORTS & CASH CLOSURE (RELATÓRIOS E FECHAMENTO DE CAIXA)
    // =============================================
    let _reportFilteredOrders = [];

    async function initReportsTab() {
        const select = document.getElementById('report-preset-select');
        if (select) select.value = 'month';
        handleReportPresetChange('month');
    }

    function handleReportPresetChange(preset) {
        const startDateInput = document.getElementById('report-start-date');
        const endDateInput = document.getElementById('report-end-date');
        if (!startDateInput || !endDateInput) return;

        const now = new Date();
        let start = new Date();
        let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        switch(preset) {
            case 'today':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                break;
            case '7days':
                start.setDate(now.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                break;
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                break;
            case '2months':
                start.setMonth(now.getMonth() - 2);
                start.setHours(0, 0, 0, 0);
                break;
            case '3months':
                start.setMonth(now.getMonth() - 3);
                start.setHours(0, 0, 0, 0);
                break;
            case 'year':
                start.setFullYear(now.getFullYear() - 1);
                start.setHours(0, 0, 0, 0);
                break;
            case 'custom':
                return;
        }

        const toIsoDate = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        startDateInput.value = toIsoDate(start);
        endDateInput.value = toIsoDate(end);

        applyReportFilter();
    }

    function applyReportFilter() {
        const startVal = document.getElementById('report-start-date')?.value;
        const endVal = document.getElementById('report-end-date')?.value;
        const labelEl = document.getElementById('rep-period-label');

        const startTime = startVal ? new Date(`${startVal}T00:00:00`).getTime() : 0;
        const endTime = endVal ? new Date(`${endVal}T23:59:59`).getTime() : Infinity;

        if (labelEl && startVal && endVal) {
            const fStart = new Date(`${startVal}T00:00:00`).toLocaleDateString('pt-BR');
            const fEnd = new Date(`${endVal}T00:00:00`).toLocaleDateString('pt-BR');
            labelEl.innerText = `Período: ${fStart} a ${fEnd}`;
        }

        _reportFilteredOrders = adminOrders.filter(o => {
            if (!o.created_at) return true;
            const t = new Date(o.created_at).getTime();
            return t >= startTime && t <= endTime;
        });

        const paidStatuses = ['preparando', 'saiu_entrega', 'entregue', 'confirmed', 'cooking', 'delivering', 'delivered'];
        const paidOrders = _reportFilteredOrders.filter(o => paidStatuses.includes(o.status));
        const cancelledOrders = _reportFilteredOrders.filter(o => ['cancelado', 'cancelled'].includes(o.status));

        const revenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
        const avgTicket = paidOrders.length > 0 ? revenue / paidOrders.length : 0;

        document.getElementById('rep-revenue').innerText = `R$ ${revenue.toFixed(2).replace('.', ',')}`;
        document.getElementById('rep-completed-count').innerText = paidOrders.length;
        document.getElementById('rep-avg-ticket').innerText = `R$ ${avgTicket.toFixed(2).replace('.', ',')}`;
        document.getElementById('rep-cancelled-count').innerText = cancelledOrders.length;

        renderReportTable(_reportFilteredOrders);
    }

    function renderReportTable(orders) {
        const tableBody = document.getElementById('report-orders-table');
        if (!tableBody) return;

        if (!orders || orders.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-on-surface-variant italic">Nenhum pedido encontrado no período selecionado.</td></tr>`;
            return;
        }

        tableBody.innerHTML = orders.map(o => {
            const dateStr = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '--';

            let itemsList = [];
            if (Array.isArray(o.order_items) && o.order_items.length > 0) {
                itemsList = o.order_items.map(i => `${i.quantity}x ${i.product_name}`);
            } else if (Array.isArray(o.items)) {
                itemsList = o.items.map(i => `${i.quantity || 1}x ${i.name || i.product_name}`);
            }
            const itemsText = itemsList.length > 0 ? itemsList.join(', ') : 'Marmitas Fit';

            return `
                <tr class="hover:bg-surface-container/50">
                    <td class="py-3 px-3 font-bold text-primary">${o.code}</td>
                    <td class="py-3 px-3 text-on-surface-variant text-[11px]">${dateStr}</td>
                    <td class="py-3 px-3 font-bold text-primary">${o.customer_name}</td>
                    <td class="py-3 px-3 max-w-[200px] text-xs font-bold text-primary break-words">${itemsText}</td>
                    <td class="py-3 px-3 font-bold text-primary">R$ ${parseFloat(o.total_amount || 0).toFixed(2).replace('.', ',')}</td>
                    <td class="py-3 px-3 text-on-surface-variant text-[11px]">${o.payment_method || 'Pix / WhatsApp'}</td>
                    <td class="py-3 px-3">
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${getStatusBadgeClass(o.status)}">
                            ${getStatusLabel(o.status)}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function handleCashClosure() {
        if (!confirm("Deseja realizar o FECHAMENTO DE CAIXA do dia?\n\nO caixa será zerado e um registro de fechamento será gravado.")) return;

        if (typeof saveSettingInSupabase === 'function') {
            await saveSettingInSupabase('cashbox_total', '0.00');
        } else {
            const cached = localStorage.getItem('lise_settings') || '{}';
            let s = {}; try { s = JSON.parse(cached); } catch(e) {}
            s['cashbox_total'] = '0.00';
            localStorage.setItem('lise_settings', JSON.stringify(s));
        }

        showToast('🔒 Fechamento de Caixa realizado com sucesso! Caixa zerado.', 'success');
        await loadAdminData();

        if (confirm("Fechamento concluído! Deseja imprimir o relatório de fechamento de hoje agora?")) {
            handlePrintReport();
        }
    }

    function handlePrintReport() {
        const startVal = document.getElementById('report-start-date')?.value || new Date().toISOString().split('T')[0];
        const endVal = document.getElementById('report-end-date')?.value || new Date().toISOString().split('T')[0];

        const fStart = new Date(`${startVal}T00:00:00`).toLocaleDateString('pt-BR');
        const fEnd = new Date(`${endVal}T00:00:00`).toLocaleDateString('pt-BR');

        const paidStatuses = ['preparando', 'saiu_entrega', 'entregue', 'confirmed', 'cooking', 'delivering', 'delivered'];
        const paidOrders = _reportFilteredOrders.filter(o => paidStatuses.includes(o.status));
        const cancelledOrders = _reportFilteredOrders.filter(o => ['cancelado', 'cancelled'].includes(o.status));

        const revenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
        const avgTicket = paidOrders.length > 0 ? revenue / paidOrders.length : 0;
        const now = new Date().toLocaleString('pt-BR');

        let rowsHtml = '';
        _reportFilteredOrders.forEach(o => {
            const dateStr = o.created_at ? new Date(o.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '--';
            rowsHtml += `
                <tr>
                    <td><b>${o.code}</b></td>
                    <td>${dateStr}</td>
                    <td>${o.customer_name}</td>
                    <td>R$ ${parseFloat(o.total_amount||0).toFixed(2).replace('.',',')}</td>
                    <td>${getStatusLabel(o.status)}</td>
                </tr>
            `;
        });

        const printWin = window.open('', '_blank', 'width=800,height=900');
        printWin.document.write(\`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Relatório Financeiro & Fechamento de Caixa</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; padding: 10px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .sep { border-top: 1px dashed #000; margin: 10px 0; }
  .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
  .title { font-size: 18px; font-weight: bold; }
  .subtitle { font-size: 12px; margin-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; }
  th { background-color: #f2f2f2; font-weight: bold; }
  .sig-area { margin-top: 40px; text-align: center; font-size: 11px; }
</style>
</head>
<body>
<div class="center title">LISE COZINHA FIT</div>
<div class="center subtitle">RELATÓRIO FINANCEIRO E FECHAMENTO DE CAIXA</div>
<div class="sep"></div>

<div><b>Período do Relatório:</b> \${fStart} até \${fEnd}</div>
<div><b>Data de Emissão:</b> \${now}</div>
<div class="sep"></div>

<div class="bold" style="margin-bottom:6px;">RESUMO EXECUTIVO DO CAIXA:</div>
<div class="row"><span>Faturamento Total (Pago/Confirmado):</span><b>R$ \${revenue.toFixed(2).replace('.',',')}</b></div>
<div class="row"><span>Total de Pedidos Concluídos:</span><b>\${paidOrders.length}</b></div>
<div class="row"><span>Ticket Médio por Pedido:</span><b>R$ \${avgTicket.toFixed(2).replace('.',',')}</b></div>
<div class="row"><span>Pedidos Cancelados no Período:</span><b>\${cancelledOrders.length}</b></div>

<div class="sep"></div>
<div class="bold">RELAÇÃO DE PEDIDOS NO PERÍODO (\${_reportFilteredOrders.length}):</div>

<table>
  <thead>
    <tr>
      <th>Código</th>
      <th>Hora</th>
      <th>Cliente</th>
      <th>Valor Total</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    \${rowsHtml || '<tr><td colspan="5">Nenhum pedido registrado no período.</td></tr>'}
  </tbody>
</table>

<div class="sep"></div>
<div class="sig-area">
  _______________________________________________________<br/>
  <b>Assinatura do Gerente / Responsável pelo Fechamento</b><br/>
  Lise Cozinha Fit — Sistema de Gerenciamento
</div>

<script>
  window.onload = function() {
    window.print();
  }
<\/script>
</body>
</html>
        \`);
        printWin.document.close();
    }
