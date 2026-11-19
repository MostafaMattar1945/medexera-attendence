// Cloudflare Pages Function: /api/health
export const onRequestGet: PagesFunction = async () => {
  return new Response(
    JSON.stringify({
      status: 'healthy',
      service: 'Medexera Attendance Cloudflare Edge API',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};

