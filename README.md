# 🥗 Lise Cozinha Fit - Gastronomia Saudável

Aplicação web completa para a **Lise Cozinha**, especializada em marmitas fit, refeições low-carb, sopas detox e sobremesas saudáveis com entrega rápida.

## 📁 Estructura de Carpetas

La aplicación está organizada de forma limpia y amigable:

```
Lise_cozinha/
├── index.html            # Página de Inicio (Destaques, Hero Slider, Diferenciais)
├── cardapio/
│   └── index.html        # Cardápio Completo (Filtros Fit, Low Carb, Sopas, Busca)
├── pedidos/
│   └── index.html        # Meus Pedidos (Rastreador ao vivo & Histórico de Pedidos)
├── avaliacoes/
│   └── index.html        # Avaliações (Depoimentos de clientes e formulário)
├── perfil/
│   └── index.html        # Meu Perfil (Dados de contato e endereços de entrega)
├── design-system/
│   └── DESIGN.md         # Sistema de diseño Organic Vitality
├── assets/
│   └── js/
│       └── app.js        # Módulo JS Global (Estado del carrito, Drawer & WhatsApp)
├── vercel.json           # Configuración para despliegue en Vercel (cleanUrls)
└── package.json          # Scripts para desarrollo local y Vercel
```

## 🚀 Características Principales

1. **Carrito Global Persistente**: Guarda los productos en `localStorage` sincronizando cantidades e insignias en todas las pantallas.
2. **Finalización por WhatsApp**: Envía el pedido formateado directamente al número de WhatsApp de Lise Cozinha.
3. **Función Refazer Pedido**: Carga pedidos anteriores al carrito con 1 clic.
4. **Navegación Unificada**: Barra de navegación inferior móvil y menú responsive.
5. **Listo para Vercel**: Rutas limpias (`/cardapio`, `/pedidos`, `/avaliacoes`, `/perfil`).

## 💻 Desarrollo Local

Para ejecutar localmente:

```bash
npm run dev
```

Abra su navegador en `http://localhost:3000`.

## 🌐 Hospedaje en Vercel

1. Suba este proyecto a **GitHub**, **GitLab** o use la **Vercel CLI**:
   ```bash
   npx vercel
   ```
2. Vercel detectará el archivo `vercel.json` y desplegará la aplicación automáticamente con rutas limpias.
