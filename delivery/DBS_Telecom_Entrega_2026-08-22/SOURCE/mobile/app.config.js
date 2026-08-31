module.exports = ({ config }) => {
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || 'https://dbs-telecom-api.joaopaulo-grv4.workers.dev/api';
    const isUnsafeLocalUrl = apiUrl && /(?:localhost|127\.0\.0\.1|10\.0\.2\.2)/i.test(apiUrl);

    if (!apiUrl || !apiUrl.startsWith('https://') || isUnsafeLocalUrl) {
      throw new Error(
        'Production builds require a non-local HTTPS backend URL.'
      );
    }
  }

  return config;
};
