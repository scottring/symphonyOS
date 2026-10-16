export function proxyHeaders(incoming:Record<string,string|string[]|undefined>,key:string):Record<string,string> {
 const headers:Record<string,string>={apikey:key}
 for(const name of ['authorization','content-type','accept','prefer','range','range-unit','accept-profile','content-profile','x-symphony-command','x-symphony-attempt']) {
  const value=incoming[name];if(typeof value==='string')headers[name]=value
 }
 return headers
}
