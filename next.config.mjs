/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Production optimizations
  poweredByHeader: false,
  compress: true,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Headers for security and caching
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/(.*).(svg|jpg|jpeg|png|gif|ico|webp)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // Transpile Adobe React Spectrum packages
  transpilePackages: [
    '@adobe/react-spectrum',
    '@react-spectrum/actionbar',
    '@react-spectrum/actiongroup',
    '@react-spectrum/avatar',
    '@react-spectrum/badge',
    '@react-spectrum/breadcrumbs',
    '@react-spectrum/button',
    '@react-spectrum/buttongroup',
    '@react-spectrum/calendar',
    '@react-spectrum/checkbox',
    '@react-spectrum/color',
    '@react-spectrum/combobox',
    '@react-spectrum/contextualhelp',
    '@react-spectrum/datepicker',
    '@react-spectrum/dialog',
    '@react-spectrum/divider',
    '@react-spectrum/dnd',
    '@react-spectrum/form',
    '@react-spectrum/icon',
    '@react-spectrum/illustratedmessage',
    '@react-spectrum/image',
    '@react-spectrum/inlinealert',
    '@react-spectrum/label',
    '@react-spectrum/labeledvalue',
    '@react-spectrum/layout',
    '@react-spectrum/link',
    '@react-spectrum/list',
    '@react-spectrum/listbox',
    '@react-spectrum/menu',
    '@react-spectrum/meter',
    '@react-spectrum/numberfield',
    '@react-spectrum/overlays',
    '@react-spectrum/picker',
    '@react-spectrum/progress',
    '@react-spectrum/provider',
    '@react-spectrum/radio',
    '@react-spectrum/searchfield',
    '@react-spectrum/slider',
    '@react-spectrum/statuslight',
    '@react-spectrum/switch',
    '@react-spectrum/table',
    '@react-spectrum/tabs',
    '@react-spectrum/tag',
    '@react-spectrum/text',
    '@react-spectrum/textfield',
    '@react-spectrum/theme-dark',
    '@react-spectrum/theme-default',
    '@react-spectrum/theme-light',
    '@react-spectrum/tooltip',
    '@react-spectrum/view',
    '@react-spectrum/well',
    '@spectrum-icons/illustrations',
    '@spectrum-icons/workflow',
  ],
};

export default nextConfig;

