const {getStore} = require('./lib/research-store');
const {service} = require('./lib/research-service');
exports.handler = async event => {
  const headers = {'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'};
  if (event.httpMethod !== 'GET') return {statusCode:405,headers,body:JSON.stringify({error:'Use GET.'})};
  try {
    const result = await service(getStore(),event.queryStringParameters || {});
    return {statusCode:result.status || 200,headers,body:JSON.stringify(result)};
  } catch (error) {
    console.error('Research query failed:',error.message);
    return {statusCode:503,headers:{...headers,'cache-control':'no-store'},body:JSON.stringify({error:'Research is temporarily unavailable. Please retry.'})};
  }
};
