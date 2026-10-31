/** Local process runner, deliberately separate from serverless app runtime. */
export async function runRetryLoop(tick:()=>Promise<unknown>, stopping:()=>boolean, wait:(ms:number)=>Promise<void>, warn:()=>void){
 while(!stopping()){
  try{await tick();}catch{warn();}
  if(!stopping())await wait(2000);
 }
}