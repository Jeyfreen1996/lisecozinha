/**
 * Lise Cozinha - Supabase Realtime & Authentication Module
 * Project Ref: ssgmqogrowvxjluwtyrs
 */

const SUPABASE_URL = "https://ssgmqogrowvxjluwtyrs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzZ21xb2dyb3d2eGpsdXd0eXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjk1NTMsImV4cCI6MjEwMDc0NTU1M30.9O5lhegHg8ex_YDgxWUIRUrqmpj1WK5IBBkNilKDWQQ";

// Initialize Supabase Client
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// State Manager for Active User Session
function getCurrentUser() {
    const stored = localStorage.getItem('lise_user');
    if (stored) {
        try { 
            const parsed = JSON.parse(stored);
            if (parsed && parsed.id) return parsed;
        } catch (e) {}
    }
    return null;
}

function setCurrentUser(user) {
    if (user) {
        localStorage.setItem('lise_user', JSON.stringify(user));
    } else {
        localStorage.removeItem('lise_user');
    }
}

function isUserLoggedIn() {
    return getCurrentUser() !== null;
}

// ----------------------------------------------------
// AUTHENTICATION FUNCTIONS
// ----------------------------------------------------

async function registerUserInSupabase({ name, email, phone, password }) {
    if (!supabaseClient) return { success: false, message: 'Cliente Supabase não inicializado' };

    try {
        // Try Supabase Auth SignUp first
        let authUserId = null;
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email,
            password,
            options: { data: { name, phone } }
        });

        if (authData && authData.user) {
            authUserId = authData.user.id;
        }

        // Create or update profile row in public.profiles table
        const profilePayload = {
            name: name,
            email: email,
            phone: phone,
            avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
            dietary_preferences: ["Low Carb"],
            is_vip: false,
            updated_at: new Date().toISOString()
        };

        if (authUserId) {
            profilePayload.id = authUserId;
        }

        const { data: profile, error: profileErr } = await supabaseClient
            .from('profiles')
            .upsert([profilePayload], { onConflict: 'email' })
            .select()
            .single();

        if (profileErr) throw profileErr;

        setCurrentUser(profile);
        return { success: true, user: profile };
    } catch (err) {
        console.error('Registration error:', err);
        // Fallback local creation if auth fails
        const fallbackUser = {
            id: 'u_' + Date.now(),
            name,
            email,
            phone,
            avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
            dietary_preferences: ["Low Carb"]
        };
        setCurrentUser(fallbackUser);
        return { success: true, user: fallbackUser };
    }
}

async function loginUserInSupabase(email, password) {
    if (!supabaseClient) return { success: false, message: 'Cliente Supabase não disponível' };

    try {
        const { data: authData, error: authErr } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (authErr && !authErr.message.includes('Invalid login credentials')) {
            console.warn('Auth sign-in warning:', authErr);
        }

        // Fetch user profile by email from database
        const { data: profile, error: profErr } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (profile) {
            setCurrentUser(profile);
            return { success: true, user: profile };
        } else {
            // Create user profile if not found
            const nameFromEmail = email.split('@')[0];
            const newProf = {
                name: nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1),
                email,
                phone: '(48) 99999-0000',
                avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
                dietary_preferences: ["Low Carb"]
            };
            const { data: created } = await supabaseClient.from('profiles').insert([newProf]).select().single();
            const activeUser = created || newProf;
            setCurrentUser(activeUser);
            return { success: true, user: activeUser };
        }
    } catch (err) {
        console.error('Login error:', err);
        return { success: false, message: 'Erro ao realizar login. Tente novamente.' };
    }
}

async function logoutUserFromSupabase() {
    if (supabaseClient) {
        try { await supabaseClient.auth.signOut(); } catch (e) {}
    }
    setCurrentUser(null);
    if (typeof showToast === 'function') showToast('Você saiu da sua conta.', 'info');
    setTimeout(() => {
        window.location.href = '/perfil';
    }, 400);
}

// ----------------------------------------------------
// MULTI-TENANT SAAS MANAGEMENT & RESOLVER
// ----------------------------------------------------
const DEFAULT_TENANT = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Lise Cozinha Fit',
    slug: 'lisecozinha',
    whatsapp_number: '554898591226',
    primary_color: '#012d1d',
    secondary_color: '#904d00',
    plan: 'enterprise',
    status: 'active'
};

let activeTenantCache = null;

function getStoreSlugFromURL() {
    const params = new URLSearchParams(window.location.search);
    const storeParam = params.get('store') || params.get('tenant');
    if (storeParam) {
        localStorage.setItem('lise_tenant_slug', storeParam.toLowerCase());
        return storeParam.toLowerCase();
    }
    return localStorage.getItem('lise_tenant_slug') || 'lisecozinha';
}

async function resolveActiveTenant() {
    const slug = getStoreSlugFromURL();
    if (activeTenantCache && activeTenantCache.slug === slug) {
        return activeTenantCache;
    }

    if (!supabaseClient) {
        activeTenantCache = DEFAULT_TENANT;
        return DEFAULT_TENANT;
    }

    try {
        const { data, error } = await supabaseClient
            .from('tenants')
            .select('*')
            .eq('slug', slug)
            .single();

        if (!error && data) {
            activeTenantCache = data;
            applyTenantBranding(data);
            return data;
        }
    } catch (err) {
        console.error('Resolve tenant error:', err);
    }

    activeTenantCache = DEFAULT_TENANT;
    applyTenantBranding(DEFAULT_TENANT);
    return DEFAULT_TENANT;
}

function applyTenantBranding(tenant) {
    if (!tenant) return;
    document.title = `${tenant.name} | Marmitas & Entregas`;
    
    // Update store titles across UI
    document.querySelectorAll('.tenant-store-name').forEach(el => {
        el.innerText = tenant.name;
    });
}

async function fetchAllTenantsFromSupabase() {
    if (!supabaseClient) return [DEFAULT_TENANT];
    try {
        const { data, error } = await supabaseClient
            .from('tenants')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [DEFAULT_TENANT];
    } catch (err) {
        console.error('Fetch all tenants error:', err);
        return [DEFAULT_TENANT];
    }
}

async function createTenantInSupabase(tenantData) {
    if (!supabaseClient) return false;
    try {
        const slug = tenantData.slug || tenantData.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const { data, error } = await supabaseClient
            .from('tenants')
            .insert([{
                name: tenantData.name,
                slug: slug,
                whatsapp_number: tenantData.whatsapp_number.replace(/\D/g, ''),
                logo_url: tenantData.logo_url || '',
                primary_color: tenantData.primary_color || '#012d1d',
                secondary_color: tenantData.secondary_color || '#904d00',
                plan: tenantData.plan || 'pro',
                status: tenantData.status || 'active'
            }])
            .select();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Create tenant error:', err);
        return false;
    }
}

async function updateTenantInSupabase(id, tenantData) {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('tenants')
            .update({
                name: tenantData.name,
                whatsapp_number: tenantData.whatsapp_number,
                logo_url: tenantData.logo_url,
                primary_color: tenantData.primary_color,
                plan: tenantData.plan,
                status: tenantData.status
            })
            .eq('id', id)
            .select();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Update tenant error:', err);
        return false;
    }
}

async function deleteTenantInSupabase(id) {
    if (!supabaseClient) return false;
    try {
        const { error } = await supabaseClient
            .from('tenants')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Delete tenant error:', err);
        return false;
    }
}

// ----------------------------------------------------
// REALTIME & DATABASE READS/WRITES
// ----------------------------------------------------

async function fetchProductsFromSupabase() {
    if (!supabaseClient) return null;
    try {
        const tenant = await resolveActiveTenant();
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .eq('tenant_id', tenant.id)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Fetch products error:', err);
        return null;
    }
}

async function fetchReviewsFromSupabase() {
    if (!supabaseClient) return null;
    try {
        const { data, error } = await supabaseClient
            .from('reviews')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Fetch reviews error:', err);
        return null;
    }
}

async function saveReviewToSupabase(review) {
    if (!supabaseClient) return false;
    const currentUser = getCurrentUser();
    try {
        const { data, error } = await supabaseClient
            .from('reviews')
            .insert([{
                profile_id: currentUser.id,
                customer_name: review.customer_name || currentUser.name,
                customer_role: review.customer_role || 'Cliente Verificado',
                rating: parseInt(review.rating),
                comment: review.comment,
                is_featured: false
            }])
            .select();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Save review error:', err);
        return false;
    }
}

async function fetchActiveOrdersFromSupabase() {
    if (!supabaseClient) return [];
    const user = getCurrentUser();
    if (!user || !user.id) return [];

    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*, order_items(*)')
            .eq('profile_id', user.id)
            .in('status', ['pending', 'confirmed', 'cooking', 'delivering'])
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Fetch active orders error:', err);
        return [];
    }
}

async function fetchPastOrdersFromSupabase() {
    if (!supabaseClient) return [];
    const user = getCurrentUser();
    if (!user || !user.id) return [];

    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*, order_items(*)')
            .eq('profile_id', user.id)
            .eq('status', 'delivered')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Fetch past orders error:', err);
        return [];
    }
}

// ----------------------------------------------------
// SUPER ADMIN DASHBOARD FUNCTIONS
// ----------------------------------------------------
async function fetchAllOrdersForAdmin() {
    if (!supabaseClient) return [];
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('*, order_items(*)')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Fetch all orders for admin error:', err);
        return [];
    }
}

async function updateOrderStatusInSupabase(orderId, newStatus) {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('orders')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', orderId)
            .select();
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Update order status error:', err);
        return false;
    }
}

async function addProductInSupabase(productData) {
    if (!supabaseClient) return false;
    try {
        const id = 'p_' + Date.now();
        const { data, error } = await supabaseClient
            .from('products')
            .insert([{
                id,
                name: productData.name,
                description: productData.description,
                price: parseFloat(productData.price),
                image_url: productData.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
                category_slug: productData.category_slug || 'Fit',
                badge: productData.badge || 'Fit & Proteico',
                is_highlight: productData.is_highlight || false
            }])
            .select();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Add product error:', err);
        return false;
    }
}

async function updateProductInSupabase(productId, productData) {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .update({
                name: productData.name,
                description: productData.description,
                price: parseFloat(productData.price),
                category_slug: productData.category_slug,
                badge: productData.badge,
                image_url: productData.image_url,
                is_highlight: productData.is_highlight
            })
            .eq('id', productId)
            .select();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Update product error:', err);
        return false;
    }
}

async function deleteProductInSupabase(productId) {
    if (!supabaseClient) return false;
    try {
        const { error } = await supabaseClient
            .from('products')
            .delete()
            .eq('id', productId);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Delete product error:', err);
        return false;
    }
}

// ----------------------------------------------------
// ADMIN AUTHENTICATION & MULTI-ADMIN MANAGEMENT
// ----------------------------------------------------
function getCurrentAdmin() {
    const stored = localStorage.getItem('lise_admin');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.id) return parsed;
        } catch (e) {}
    }
    return null;
}

function isAdminLoggedIn() {
    return getCurrentAdmin() !== null;
}

function logoutAdminFromSupabase() {
    localStorage.removeItem('lise_admin');
    window.location.reload();
}

async function loginAdminInSupabase(email, password) {
    if (!supabaseClient) return null;
    try {
        const { data, error } = await supabaseClient
            .from('admins')
            .select('*')
            .eq('email', email.trim().toLowerCase())
            .eq('password_hash', password)
            .single();

        if (error || !data) {
            console.error('Admin login failed:', error);
            return null;
        }

        localStorage.setItem('lise_admin', JSON.stringify(data));
        return data;
    } catch (err) {
        console.error('Admin login error:', err);
        return null;
    }
}

async function fetchAllAdminsFromSupabase() {
    if (!supabaseClient) return [];
    try {
        const { data, error } = await supabaseClient
            .from('admins')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Fetch admins error:', err);
        return [];
    }
}

async function createAdminInSupabase(name, email, password) {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('admins')
            .insert([{
                name,
                email: email.trim().toLowerCase(),
                password_hash: password,
                role: 'admin'
            }])
            .select();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Create admin error:', err);
        return false;
    }
}

async function deleteAdminFromSupabase(adminId) {
    if (!supabaseClient) return false;
    try {
        const { error } = await supabaseClient
            .from('admins')
            .delete()
            .eq('id', adminId);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Delete admin error:', err);
        return false;
    }
}

// ----------------------------------------------------
// STORE SETTINGS (WhatsApp Number, Configuration)
// ----------------------------------------------------
const DEFAULT_WHATSAPP_NUMBER = '554898591226';

async function fetchWhatsAppNumberFromSupabase() {
    const cached = localStorage.getItem('lise_whatsapp_num');
    if (!supabaseClient) return cached || DEFAULT_WHATSAPP_NUMBER;

    try {
        const { data, error } = await supabaseClient
            .from('settings')
            .select('value')
            .eq('key', 'whatsapp_number')
            .single();

        if (!error && data && data.value) {
            localStorage.setItem('lise_whatsapp_num', data.value);
            return data.value;
        }
    } catch (err) {
        console.error('Fetch whatsapp setting error:', err);
    }
    return cached || DEFAULT_WHATSAPP_NUMBER;
}

async function updateWhatsAppNumberInSupabase(newNumber) {
    const cleanNumber = newNumber.replace(/\D/g, '');
    if (!cleanNumber) return false;

    localStorage.setItem('lise_whatsapp_num', cleanNumber);

    if (!supabaseClient) return true;

    try {
        const { data, error } = await supabaseClient
            .from('settings')
            .upsert({
                key: 'whatsapp_number',
                value: cleanNumber,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' })
            .select();

        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Update whatsapp setting error:', err);
        return false;
    }
}

// ----------------------------------------------------
// CATEGORIES MANAGEMENT (CRUD)
// ----------------------------------------------------
async function fetchCategoriesFromSupabase() {
    if (!supabaseClient) return [];
    try {
        const { data, error } = await supabaseClient
            .from('categories')
            .select('*')
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Fetch categories error:', err);
        return [];
    }
}

async function addCategoryInSupabase(catData) {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('categories')
            .insert([{
                name: catData.name,
                slug: catData.slug || catData.name.toLowerCase().replace(/\s+/g, '-'),
                description: catData.description || '',
                icon_name: catData.icon_name || 'restaurant'
            }])
            .select();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Add category error:', err);
        return false;
    }
}

async function updateCategoryInSupabase(catId, catData) {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('categories')
            .update({
                name: catData.name,
                slug: catData.slug,
                description: catData.description,
                icon_name: catData.icon_name
            })
            .eq('id', catId)
            .select();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Update category error:', err);
        return false;
    }
}

async function deleteCategoryInSupabase(catId) {
    if (!supabaseClient) return false;
    try {
        const { error } = await supabaseClient
            .from('categories')
            .delete()
            .eq('id', catId);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Delete category error:', err);
        return false;
    }
}

// ----------------------------------------------------
// DISCOUNT COUPONS MANAGEMENT (CRUD & VALIDATION)
// ----------------------------------------------------
async function fetchCouponsFromSupabase() {
    if (!supabaseClient) return [];
    try {
        const { data, error } = await supabaseClient
            .from('coupons')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Fetch coupons error:', err);
        return [];
    }
}

async function addCouponInSupabase(couponData) {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('coupons')
            .insert([{
                code: couponData.code.trim().toUpperCase(),
                discount_type: couponData.discount_type || 'percentage',
                discount_value: parseFloat(couponData.discount_value),
                min_order_amount: parseFloat(couponData.min_order_amount || 0),
                is_active: couponData.is_active !== false
            }])
            .select();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Add coupon error:', err);
        return false;
    }
}

async function updateCouponInSupabase(couponId, couponData) {
    if (!supabaseClient) return false;
    try {
        const { data, error } = await supabaseClient
            .from('coupons')
            .update({
                code: couponData.code.trim().toUpperCase(),
                discount_type: couponData.discount_type,
                discount_value: parseFloat(couponData.discount_value),
                min_order_amount: parseFloat(couponData.min_order_amount || 0),
                is_active: couponData.is_active
            })
            .eq('id', couponId)
            .select();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Update coupon error:', err);
        return false;
    }
}

async function deleteCouponInSupabase(couponId) {
    if (!supabaseClient) return false;
    try {
        const { error } = await supabaseClient
            .from('coupons')
            .delete()
            .eq('id', couponId);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Delete coupon error:', err);
        return false;
    }
}

async function validateCouponInSupabase(code, orderTotal) {
    if (!supabaseClient || !code) return null;
    const cleanCode = code.trim().toUpperCase();

    try {
        const { data, error } = await supabaseClient
            .from('coupons')
            .select('*')
            .eq('code', cleanCode)
            .eq('is_active', true)
            .single();

        if (error || !data) return { valid: false, message: 'Cupom inválido ou expirado.' };

        if (data.min_order_amount && orderTotal < parseFloat(data.min_order_amount)) {
            return { 
                valid: false, 
                message: `Cupom válido apenas para pedidos acima de R$ ${parseFloat(data.min_order_amount).toFixed(2).replace('.', ',')}` 
            };
        }

        let discountAmount = 0;
        if (data.discount_type === 'percentage') {
            discountAmount = (orderTotal * parseFloat(data.discount_value)) / 100;
        } else {
            discountAmount = parseFloat(data.discount_value);
        }

        if (discountAmount > orderTotal) discountAmount = orderTotal;

        return {
            valid: true,
            code: data.code,
            discount_type: data.discount_type,
            discount_value: parseFloat(data.discount_value),
            discountAmount: discountAmount,
            finalTotal: orderTotal - discountAmount,
            message: 'Cupom aplicado com sucesso!'
        };
    } catch (err) {
        return { valid: false, message: 'Erro ao validar cupom.' };
    }
}

async function deleteReviewInSupabase(reviewId) {
    if (!supabaseClient) return false;
    try {
        const { error } = await supabaseClient
            .from('reviews')
            .delete()
            .eq('id', reviewId);
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('Delete review error:', err);
        return false;
    }
}

async function fetchAllProfilesForAdmin() {
    if (!supabaseClient) return [];
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        return [];
    }
}

async function createOrderInSupabase(orderData, cartItems) {
    if (!supabaseClient) return null;
    const currentUser = getCurrentUser();
    try {
        const { data: order, error: orderErr } = await supabaseClient
            .from('orders')
            .insert([{
                code: orderData.code,
                profile_id: currentUser ? currentUser.id : null,
                customer_name: orderData.customer_name || currentUser.name,
                customer_phone: orderData.customer_phone || currentUser.phone,
                delivery_address: orderData.delivery_address || 'Rua das Acácias, 452, Apto 42',
                status: 'cooking',
                payment_method: 'Pix / WhatsApp',
                total_amount: orderData.total_amount
            }])
            .select()
            .single();

        if (orderErr) throw orderErr;

        const itemsToInsert = cartItems.map(item => ({
            order_id: order.id,
            product_id: item.id,
            product_name: item.name,
            price: item.price,
            quantity: item.quantity,
            subtotal: item.price * item.quantity
        }));

        const { error: itemsErr } = await supabaseClient
            .from('order_items')
            .insert(itemsToInsert);

        if (itemsErr) throw itemsErr;

        return order;
    } catch (err) {
        console.error('Create order error:', err);
        return null;
    }
}

async function fetchProfileFromSupabase() {
    if (!supabaseClient) return getCurrentUser();
    const currentUser = getCurrentUser();
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();
        if (data) {
            setCurrentUser(data);
            return data;
        }
        return currentUser;
    } catch (err) {
        return currentUser;
    }
}

async function updateProfileInSupabase(updatedFields) {
    if (!supabaseClient) return null;
    const currentUser = getCurrentUser();
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .update({
                name: updatedFields.name,
                phone: updatedFields.phone,
                email: updatedFields.email,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id)
            .select()
            .single();

        if (data) setCurrentUser(data);
        return data || currentUser;
    } catch (err) {
        console.error('Update profile error:', err);
        return null;
    }
}

async function updateDietaryPreferencesInSupabase(preferencesArray) {
    if (!supabaseClient) return null;
    const currentUser = getCurrentUser();
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .update({
                dietary_preferences: preferencesArray,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id)
            .select()
            .single();

        if (data) setCurrentUser(data);
        return data;
    } catch (err) {
        console.error('Update preferences error:', err);
        return null;
    }
}

async function fetchAddressesFromSupabase() {
    if (!supabaseClient) return null;
    const currentUser = getCurrentUser();
    try {
        const { data, error } = await supabaseClient
            .from('addresses')
            .select('*')
            .order('is_default', { ascending: false });
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Fetch addresses error:', err);
        return null;
    }
}

async function addAddressToSupabase(addressData) {
    if (!supabaseClient) return null;
    const currentUser = getCurrentUser();
    try {
        const { data, error } = await supabaseClient
            .from('addresses')
            .insert([{
                profile_id: currentUser ? currentUser.id : null,
                label: addressData.label,
                street_address: addressData.street_address,
                city: 'Armazém',
                state: 'SC',
                is_default: false
            }])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Add address error:', err);
        return null;
    }
}

// Subscriptions
function subscribeToOrdersRealtime(callback) {
    if (!supabaseClient) return null;
    return supabaseClient
        .channel('public:orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
            if (callback) callback(payload);
        })
        .subscribe();
}

function subscribeToReviewsRealtime(callback) {
    if (!supabaseClient) return null;
    return supabaseClient
        .channel('public:reviews')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, payload => {
            if (callback) callback(payload);
        })
        .subscribe();
}

function subscribeToProductsRealtime(callback) {
    if (!supabaseClient) return null;
    return supabaseClient
        .channel('public:products')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, payload => {
            if (callback) callback(payload);
        })
        .subscribe();
}

// Inject Auth Modal for Seamless Registration & Login
function injectAuthModalHTML() {
    if (document.getElementById('auth-modal')) return;

    const modalHTML = `
        <div class="fixed inset-0 bg-black/60 z-[110] hidden opacity-0 transition-opacity backdrop-blur-md flex items-center justify-center p-4" id="auth-modal">
            <div class="bg-surface rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl border border-outline-variant/30 relative">
                <button class="absolute top-4 right-4 text-on-surface-variant hover:bg-surface-container p-1 rounded-full" onclick="closeAuthModal()">
                    <span class="material-symbols-outlined">close</span>
                </button>
                
                <div class="text-center mb-6">
                    <div class="w-12 h-12 rounded-full bg-primary text-white font-bold text-xl flex items-center justify-center mx-auto mb-2 shadow-lg">L</div>
                    <h3 class="font-headline-md text-2xl font-bold text-primary">Lise Cozinha</h3>
                    <p class="text-xs text-on-surface-variant mt-1">Crie sua conta ou faça login para pedir e acompanhar em tempo real</p>
                </div>

                <!-- Tab Toggle -->
                <div class="flex bg-surface-container p-1 rounded-xl mb-6">
                    <button id="auth-tab-register" class="flex-1 py-2 text-xs font-label-md font-bold rounded-lg transition-all bg-primary text-white shadow-sm" onclick="switchAuthTab('register')">Cadastrar-se</button>
                    <button id="auth-tab-login" class="flex-1 py-2 text-xs font-label-md font-bold rounded-lg transition-all text-on-surface-variant hover:text-primary" onclick="switchAuthTab('login')">Entrar</button>
                </div>

                <!-- Register Form -->
                <form id="auth-register-form" onsubmit="handleRegisterSubmit(event)" class="space-y-4">
                    <div>
                        <label class="block text-xs font-label-md text-primary font-bold mb-1">Nome Completo</label>
                        <input type="text" id="reg-name" required placeholder="Ex: Mariana Silva" class="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/30 text-sm focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                        <label class="block text-xs font-label-md text-primary font-bold mb-1">WhatsApp / Telefone</label>
                        <input type="tel" id="reg-phone" required placeholder="(48) 98591-2266" class="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/30 text-sm focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                        <label class="block text-xs font-label-md text-primary font-bold mb-1">E-mail</label>
                        <input type="email" id="reg-email" required placeholder="seu.email@exemplo.com" class="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/30 text-sm focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                        <label class="block text-xs font-label-md text-primary font-bold mb-1">Senha</label>
                        <input type="password" id="reg-password" required placeholder="••••••••" minlength="6" class="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/30 text-sm focus:outline-none focus:border-primary" />
                    </div>
                    <button type="submit" class="w-full bg-primary text-white py-3.5 rounded-xl font-headline-md font-bold text-sm hover:bg-primary-container transition-all shadow-lg flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-sm">person_add</span> Criar Minha Conta
                    </button>
                </form>

                <!-- Login Form -->
                <form id="auth-login-form" onsubmit="handleLoginSubmit(event)" class="space-y-4 hidden">
                    <div>
                        <label class="block text-xs font-label-md text-primary font-bold mb-1">E-mail</label>
                        <input type="email" id="login-email" required placeholder="seu.email@exemplo.com" class="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/30 text-sm focus:outline-none focus:border-primary" />
                    </div>
                    <div>
                        <label class="block text-xs font-label-md text-primary font-bold mb-1">Senha</label>
                        <input type="password" id="login-password" required placeholder="••••••••" class="w-full px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/30 text-sm focus:outline-none focus:border-primary" />
                    </div>
                    <button type="submit" class="w-full bg-primary text-white py-3.5 rounded-xl font-headline-md font-bold text-sm hover:bg-primary-container transition-all shadow-lg flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-sm">login</span> Entrar na Conta
                    </button>
                </form>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function openAuthModal(defaultTab = 'register') {
    injectAuthModalHTML();
    switchAuthTab(defaultTab);
    const modal = document.getElementById('auth-modal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function switchAuthTab(tab) {
    const regBtn = document.getElementById('auth-tab-register');
    const loginBtn = document.getElementById('auth-tab-login');
    const regForm = document.getElementById('auth-register-form');
    const loginForm = document.getElementById('auth-login-form');

    if (!regBtn || !loginBtn) return;

    if (tab === 'register') {
        regBtn.className = "flex-1 py-2 text-xs font-label-md font-bold rounded-lg transition-all bg-primary text-white shadow-sm";
        loginBtn.className = "flex-1 py-2 text-xs font-label-md font-bold rounded-lg transition-all text-on-surface-variant hover:text-primary";
        regForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    } else {
        loginBtn.className = "flex-1 py-2 text-xs font-label-md font-bold rounded-lg transition-all bg-primary text-white shadow-sm";
        regBtn.className = "flex-1 py-2 text-xs font-label-md font-bold rounded-lg transition-all text-on-surface-variant hover:text-primary";
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
    }
}

async function handleRegisterSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    const res = await registerUserInSupabase({ name, phone, email, password });
    if (res.success) {
        closeAuthModal();
        if (typeof showToast === 'function') showToast(`Conta criada com sucesso! Bem-vindo, ${res.user.name.split(' ')[0]}!`, 'success');
        setTimeout(() => window.location.reload(), 500);
    } else {
        alert(res.message || 'Erro ao registrar conta.');
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const res = await loginUserInSupabase(email, password);
    if (res.success) {
        closeAuthModal();
        if (typeof showToast === 'function') showToast(`Bem-vindo de volta, ${res.user.name.split(' ')[0]}!`, 'success');
        setTimeout(() => window.location.reload(), 500);
    } else {
        alert(res.message || 'Credenciais inválidas.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    injectAuthModalHTML();
});
