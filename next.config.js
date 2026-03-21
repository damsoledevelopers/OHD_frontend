/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async redirects() {
    return [
      {
        source: '/admin/companies/details-form',
        destination: '/companies',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig

