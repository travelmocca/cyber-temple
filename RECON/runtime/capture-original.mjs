import {chromium} from 'playwright-core'
import {mkdir,writeFile} from 'node:fs/promises'
await mkdir('RECON/runtime',{recursive:true})
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
try {
 const page=await browser.newPage({viewport:{width:960,height:451}})
 const urls=new Map()
 page.on('response',r=>{
   const u=new URL(r.url())
   if(u.protocol==='https:') urls.set(u.origin+u.pathname,{status:r.status(),type:r.request().resourceType()})
 })
 await page.addInitScript(()=>{
  const ev={contexts:[], shaders:[], draw:{},drawByFramebuffer:{}, bufferSizes:[], uploads:{}}
  window.__sansaCapture=ev
  const wrap=(p,n,f)=>{
   const original=p[n]
   if(!original) return
   Object.defineProperty(p,n,{value:function(...args){f.call(this,...args);return original.apply(this,args)},writable:true,configurable:true})
  }
  const framebuffers=new WeakMap(), active=new WeakMap()
  for(const p of [window.WebGL2RenderingContext?.prototype,window.WebGLRenderingContext?.prototype].filter(Boolean)){
   wrap(p,'shaderSource',(_,source)=>{if(ev.shaders.length<110&&!ev.shaders.includes(source))ev.shaders.push(source)})
   wrap(p,'bindFramebuffer',function(_,value){
    if(value&&!framebuffers.has(value))framebuffers.set(value,++ev.framebufferCount)
    active.set(this,value?framebuffers.get(value):0)
   })
   for(const n of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
    wrap(p,n,function(...args){
      if(!ev.recording)return
      ev.draw[n]=(ev.draw[n]??0)+1
      const id=active.get(this)??0
      ev.drawByFramebuffer[id]=(ev.drawByFramebuffer[id]??0)+1
    })
   }
   for(const n of ['texImage2D','compressedTexImage2D','texStorage2D']){
    wrap(p,n,()=>{ev.uploads[n]=(ev.uploads[n]??0)+1})
   }
  }
  ev.framebufferCount=0
  const context=HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext=function(type,...args){
    const result=context.call(this,type,...args)
    if(result&&type.startsWith('webgl')&&!ev.contexts.includes(type))ev.contexts.push(type)
    return result
  }
 })
 await page.goto('https://sansatemple.com/',{waitUntil:'domcontentloaded',timeout:30000})
 await page.waitForFunction(()=>document.querySelector('canvas[data-engine]')&&document.querySelector('#game-loading')?.classList.contains('is-loaded'),{},{timeout:65000}).catch(()=>{})
 await page.evaluate(()=>{window.__sansaCapture.recording=true})
 await page.waitForTimeout(2400)
 const result=await page.evaluate(()=>{
   const e=window.__sansaCapture;e.recording=false
   return {...e,canvas:[...document.querySelectorAll('canvas')].filter(x=>x.dataset.engine).map(x=>({engine:x.dataset.engine,width:x.width,height:x.height,light:x.dataset.light})),title:document.title,loading:document.querySelector('#game-loading')?.className}
 })
 await writeFile('RECON/runtime/original-view-frame.json',JSON.stringify(result,null,2))
 await writeFile('RECON/runtime/original-view-requests.json',JSON.stringify([...urls].map(([url,v])=>({url,...v})),null,2))
 const cdp=await page.context().newCDPSession(page)
 await page.evaluate(()=>{window.requestAnimationFrame=()=>0})
 const frame=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:87,fromSurface:true})
 await writeFile('RECON/runtime/original-view.jpg',Buffer.from(frame.data,'base64'))
 console.log(JSON.stringify({canvas:result.canvas,shaders:result.shaders.length,draw:result.draw,loading:result.loading}))
} finally {await browser.close()}
