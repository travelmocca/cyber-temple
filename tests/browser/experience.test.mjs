import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { chromium, webkit } from 'playwright-core'

let server, browser, base
before(async () => {
  await mkdir('test-results',{recursive:true})
  server = spawn(process.execPath,['server/index.mjs','--production'],{ env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit'] })
  const [message] = await once(server.stdout,'data')
  const match = String(message).match(/Listening on (\d+)/)
  assert.ok(match,String(message))
  base = 'http://127.0.0.1:' + match[1]
  const graphics = process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader']
  browser = process.env.TEST_WEBKIT === '1' ? await webkit.launch() : await chromium.launch({ channel:'chrome',args:graphics })
})
after(async () => {
  await browser?.close()
  server?.kill()
})
async function open(options) {
  const context = await browser.newContext(options)
  await context.route('**/*',route => new URL(route.request().url()).origin === base ? route.continue() : route.abort())
  const page = await context.newPage()
  const external = []
  page.on('request',request => {
    if (!request.url().startsWith(base+'/')) external.push(request.url())
  })
  const errors = []
  page.on('pageerror',error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('temple:quality','low')
    const Native = window.WebSocket
    window.walkSamples = []
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args)
        window.latestTestSocket = this
      }
      send(data) {
        const message = JSON.parse(data)
        if (message.pose === 'walk') window.walkSamples.push({x:message.x,z:message.z})
        return super.send(data)
      }
    }
  })
  await page.goto(base)
  await page.getByRole('button',{name:'进入山寺'}).click()
  await page.locator('#world canvas').waitFor()
  try {
    await waitText(page,'#online','人同在')
  } catch (error) {
    const state = await page.evaluate(() => ({
      entry:document.querySelector('#entry-error')?.textContent,
      online:document.querySelector('#online')?.textContent,
      socket:window.latestTestSocket?.readyState,
    }))
    await context.close()
    throw new Error(`访客进入失败 ${JSON.stringify({state,errors})}`,{cause:error})
  }
  return { context,page,errors,external }
}
async function waitText(page,selector,text) {
  await page.waitForFunction(([selector,text]) => document.querySelector(selector)?.textContent.includes(text),[selector,text],{timeout:15000})
}
test('desktop visits the hall, sits, bows and uses the instruments offline from original',{timeout:60000},async () => {
  const {context,page,errors,external} = await open({viewport:{width:1280,height:800}})
  try {
    await page.getByRole('button',{name:'诵念'}).click()
    await page.locator('#sound[aria-pressed=true]').waitFor()
    await page.getByRole('button',{name:'诵念'}).click()
    const range = await page.request.get(base+'/audio/chant.mp3',{headers:{Range:'bytes=0-1'}})
    assert.equal(range.status(),206)
    assert.equal((await range.body()).length,2)
    await page.getByRole('button',{name:'供养'}).click()
    await page.getByRole('button',{name:'一碗米'}).click()
    await page.getByRole('button',{name:'确认测试供养'}).click()
    await waitText(page,'#dialog-content','测试流程完成')
    await page.getByRole('button',{name:'关闭'}).click()
    await page.getByRole('button',{name:'游览'}).click()
    await page.getByRole('button',{name:'松间茶舍'}).click()
    await page.getByRole('button',{name:'停止移动'}).waitFor()
    await page.getByRole('button',{name:'松香清茶'}).click()
    await waitText(page,'#dialog-content','还可饮 3 口')
    await page.waitForTimeout(550)
    await page.getByRole('button',{name:'饮一口'}).click()
    await waitText(page,'#dialog-content','还可饮 2 口')
    await page.getByRole('button',{name:'关闭'}).click()
    await page.getByRole('button',{name:'游览'}).click()
    await page.evaluate(() => { window.walkSamples = [] })
    await page.getByRole('button',{name:'清静法堂'}).click()
    const stop = page.getByRole('button',{name:'停止移动'})
    await stop.waitFor()
    await page.waitForFunction(() => window.walkSamples.length >= 2)
    const samples = await page.evaluate(() => window.walkSamples.slice(0,2))
    assert.notDeepEqual(samples[0],samples[1])
    assert.ok(samples.every(point=>point.z > -3.1))
    await stop.click()
    await stop.waitFor({state:'hidden'})
    await page.getByRole('button',{name:'游览'}).click()
    await page.getByRole('button',{name:'清静法堂'}).click()
    await stop.waitFor()
    await stop.waitFor({state:'hidden',timeout:15000})
    await page.locator('canvas[data-altar="museum-duksu-2116"]').waitFor({timeout:15000})
    await page.getByRole('button',{name:'落座'}).click()
    await page.getByRole('button',{name:'起身'}).waitFor()
    await page.screenshot({path:'test-results/local-hall.png'})
    await page.getByRole('button',{name:/礼拜/}).click()
    await page.locator('#bow[aria-pressed=true]').waitFor()
    await page.locator('#bow[aria-pressed=false]').waitFor({timeout:9000})
    await page.getByRole('button',{name:'起身'}).waitFor()
    await page.getByRole('button',{name:/木鱼/}).click()
    await page.getByRole('button',{name:'轻敲木鱼'}).click()
    await waitText(page,'#dialog-content','已敲 1 次')
    await page.getByRole('button',{name:'关闭'}).click()
    await page.getByRole('button',{name:/念珠/}).click()
    await page.getByRole('button',{name:'拨动念珠'}).click()
    await waitText(page,'output','1 / 108')
    await page.getByRole('button',{name:'关闭'}).click()
    await page.reload()
    await page.getByRole('button',{name:'进入山寺'}).click()
    await page.getByRole('button',{name:/念珠/}).click()
    await waitText(page,'output','1 / 108')
    await page.getByRole('button',{name:'归零'}).click()
    await waitText(page,'output','0 / 108')
    assert.deepEqual(errors,[])
    assert.deepEqual(external,[])
  } finally { await context.close() }
})
test('second visitor receives greetings, can change rooms, and reconnects',{timeout:60000},async () => {
  const a = await open()
  const b = await open({viewport:{width:390,height:844},hasTouch:true,isMobile:true})
  try {
    await waitText(a.page,'#online','2 人同在')
    await waitText(b.page,'#online','2 人同在')
    await a.page.getByRole('button',{name:/合掌/}).click()
    await waitText(b.page,'#notice','合掌问候')
    await a.page.getByRole('button',{name:'祈愿'}).click()
    await b.page.getByRole('button',{name:'祈愿'}).tap()
    await a.page.getByRole('textbox',{name:'一行心愿'}).fill('愿山间有清风')
    await a.page.getByRole('button',{name:'挂上祈愿灯'}).click()
    await waitText(b.page,'#offering-list','愿山间有清风')
    await a.page.getByRole('button',{name:'加入共香'}).click()
    await waitText(b.page,'#offering-list','候场 · 1 人')
    await b.page.getByRole('button',{name:'加入共香'}).tap()
    await waitText(a.page,'#offering-list','共香进行中')
    await waitText(b.page,'#offering-list','共香进行中')
    await a.page.getByRole('button',{name:'关闭'}).click()
    await b.page.getByRole('button',{name:'关闭'}).tap()
    await b.page.screenshot({path:'test-results/local-mobile.png'})
    await b.page.locator('#rooms').tap()
    await b.page.getByRole('button',{name:/山寺 02/}).tap()
    await waitText(a.page,'#online','1 人同在')
    await waitText(b.page,'#online','1 人同在')
    await b.page.evaluate(() => window.latestTestSocket.close())
    await waitText(b.page,'#notice','正在重连')
    await waitText(b.page,'#online','1 人同在')
    await b.page.locator('#rooms').tap()
    await b.page.getByRole('button',{name:/山寺 01/}).tap()
    await waitText(a.page,'#online','2 人同在')
    await waitText(b.page,'#online','2 人同在')
    assert.deepEqual([...a.errors,...b.errors],[])
    assert.deepEqual([...a.external,...b.external],[])
  } finally {
    await b.context.close()
    await a.context.close()
  }
})

test('server enforces room capacity and releases a disconnected slot',{timeout:15000},async () => {
  const sockets = []
  const endpoint = base.replace('http:','ws:') + '/presence?room=12'
  const join = () => new Promise((resolve,reject) => {
    const socket = new WebSocket(endpoint)
    sockets.push(socket)
    socket.addEventListener('message',event => resolve(JSON.parse(event.data)),{once:true})
    socket.addEventListener('error',reject,{once:true})
  })
  try {
    for (let i=0;i<24;i++) assert.equal((await join()).type,'snapshot')
    assert.equal((await join()).type,'full')
    sockets[0].close()
    const deadline = Date.now() + 3000
    let room
    do {
      const response = await fetch(base+'/rooms')
      room = (await response.json()).find(candidate => candidate.id === '12')
      if (room.count === 23) break
      await new Promise(resolve => setTimeout(resolve,50))
    } while(Date.now() < deadline)
    assert.equal(room.count,23)
    assert.equal((await join()).type,'snapshot')
  } finally {
    for (const socket of sockets) socket.close()
  }
})

test('dragging orbits through the rear hemisphere and completes a full turn',{timeout:25000},async () => {
  const context=await browser.newContext({viewport:{width:960,height:540}})
  try {
    const page=await context.newPage()
    await page.addInitScript(() => {
      localStorage.setItem('temple:quality','low')
      const gl=WebGL2RenderingContext.prototype
      const cameras=new WeakSet()
      const get=gl.getUniformLocation
      const set=gl.uniform3f
      gl.getUniformLocation=function(program,name) {
        const location=get.call(this,program,name)
        if(name==='cameraPosition' && location) cameras.add(location)
        return location
      }
      gl.uniform3f=function(location,x,y,z) {
        if(cameras.has(location) && this.getParameter(this.FRAMEBUFFER_BINDING)===null) {
          window.orbitCamera={x,y,z}
        }
        return set.call(this,location,x,y,z)
      }
    })
    await page.goto(base)
    await page.getByRole('button',{name:'进入山寺'}).click()
    await waitText(page,'#online','人同在')
    await page.waitForFunction(() => window.orbitCamera?.z>15)
    const initial=await page.evaluate(() => window.orbitCamera)
    async function halfTurn() {
      await page.mouse.move(150,250)
      await page.mouse.down()
      await page.mouse.move(599,250,{steps:12})
      await page.mouse.up()
    }
    await halfTurn()
    await page.waitForFunction(({z})=>window.orbitCamera?.z<z-6,initial,{timeout:3500})
    await halfTurn()
    await page.waitForFunction(({x,z})=>
      Math.hypot(window.orbitCamera.x-x,window.orbitCamera.z-z)<.28,initial,{timeout:4500})
  } finally {
    await context.close()
  }
})
