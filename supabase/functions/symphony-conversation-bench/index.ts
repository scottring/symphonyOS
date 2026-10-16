// Temporary synthetic-only verification endpoint. Platform JWT verification stays enabled.
const serve = Deno.serve;
Deno.serve = ((handler: (req: Request) => Promise<Response>) => serve(async req => {
 // Browsers send an unauthenticated preflight before the authenticated POST.
 // Let the agent answer CORS only; every actual request still passes the guard.
 if(req.method==='OPTIONS')return handler(req);
 if(Date.now()>1792231960191)return new Response('Expired',{status:410});
 const auth=req.headers.get('Authorization');if(!auth)return new Response('Unauthorized',{status:401});
 const r=await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,Authorization:auth}});
 if(!r.ok||!["deb3b752-cb26-480a-910c-fb174b308409","f363838e-fabe-47c1-ae17-f27c4dbe67d0","b3516034-ed09-449d-80f2-c2cee0d5f68e","819ace88-d185-4f06-9735-219f829d8266"].includes((await r.json()).id))return new Response('Synthetic account only',{status:403});
 return handler(req);
})) as typeof Deno.serve;
await import('../symphony-agent/index.ts');
