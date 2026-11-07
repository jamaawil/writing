// A persistent, safe YAML parser for the Python importer, using the writing
// site's existing dependency. No tags capable of constructing code are loaded.
const readline=require('node:readline');
const yaml=require('js-yaml');
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on('line',line=>{
  try {
    const value=yaml.load(JSON.parse(line),{schema:yaml.JSON_SCHEMA});
    process.stdout.write(JSON.stringify({value:value && typeof value==='object' && !Array.isArray(value)?value:{}})+'\n');
  } catch(error) {process.stdout.write(JSON.stringify({error:error.message})+'\n');}
});
