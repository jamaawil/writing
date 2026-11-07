const {getStore} = require('./lib/research-store');
async function assetInfo(id) {
  const rows = await getStore().query(`SELECT a.* FROM assets a JOIN entities e ON e.id=a.entity_id WHERE a.entity_id=? AND e.published=1`,[String(id || '').slice(0,300)]);
  return rows[0];
}
exports.assetInfo = assetInfo;
exports.handler = async event => {
  if (!['GET','HEAD'].includes(event.httpMethod)) return {statusCode:405,body:'Method not allowed'};
  const asset = await assetInfo(event.queryStringParameters?.id);
  if (!asset) return {statusCode:404,body:'No public attachment matches this address.'};
  const base = process.env.RESEARCH_ASSET_BASE_URL;
  if (!base || !/^https:\/\//.test(base)) return {statusCode:503,body:'Attachment hosting has not been configured.'};
  return {statusCode:302,headers:{Location:base.replace(/\/$/,'')+'/'+asset.sha256,'Cache-Control':'public, max-age=60'},body:''};
};
