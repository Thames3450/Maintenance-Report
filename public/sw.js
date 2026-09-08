const VERSION="mvr-smart-v230";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",()=>{});
self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?.json()||{}}catch{data={title:"MVR Smart Maintenance",body:event.data?.text()||"มีการแจ้งเตือนใหม่"}}
  const title=data.title||"MVR Smart Maintenance";
  const options={
    body:data.body||"มีการแจ้งเตือนใหม่",
    icon:"./pwa-192.png",badge:"./pwa-192.png",
    tag:data.tag||undefined,renotify:Boolean(data.renotify),
    data:{route:data.route||"#/notify",...data.data},
    vibrate:[150,80,150]
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const route=event.notification.data?.route||"#/notify";
  const target=new URL(route,self.registration.scope).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of windows){
      if("focus" in client){await client.focus();if("navigate" in client)await client.navigate(target);return;}
    }
    if(self.clients.openWindow)return self.clients.openWindow(target);
  })());
});
