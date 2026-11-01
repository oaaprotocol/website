(function(){
/* Big OAA brain behind the launch window. It rests almost invisible in the dark; every few seconds
   a part of it flashes up (neural spark), sometimes a light sweep runs across it. */
var cv=document.getElementById('eyes'),x=cv.getContext('2d'),W,H,D,base=null,lit=null,box={};
var svg=window.OAA_BRAIN||'/assets/lp/brain.svg',img=new Image();img.src=svg;
function tinted(src,w,h,color){var c=document.createElement('canvas');c.width=w;c.height=h;var o=c.getContext('2d');o.imageSmoothingQuality='high';o.drawImage(src,0,0,w,h);o.globalCompositeOperation='source-in';
 if(typeof color==='string'){o.fillStyle=color}else{var g=o.createLinearGradient(0,0,0,h);color.forEach(function(s){g.addColorStop(s[0],s[1])});o.fillStyle=g}o.fillRect(0,0,w,h);return c}
function prepare(){if(!img.naturalWidth)return;var hh=(W>800?Math.min(H*1.18,W*.62):Math.min(H*.7,W*1.1))*D,ww=hh*img.naturalWidth/img.naturalHeight;
 box={w:ww,h:hh,x:(W*D-ww)/2,y:(H*D-hh)/2};
 base=tinted(img,ww,hh,[[0,'#0e2b2a'],[1,'#071717']]);                               // the brain at rest: barely visible
 lit=tinted(img,ww,hh,[[0,'#bffcf8'],[.5,'#46e3da'],[1,'#22b8b0']])}                 // the lit version used for the flashes
function size(){D=Math.min(devicePixelRatio||1,2.5);W=innerWidth;H=innerHeight;cv.width=Math.round(W*D);cv.height=Math.round(H*D);prepare()}
size();addEventListener('resize',size);img.onload=prepare;
function rnd(a,b){return a+Math.random()*(b-a)}
var F=[],next=.8,last=performance.now(),tmp=document.createElement('canvas'),tx=tmp.getContext('2d');
function spawn(){var kind=Math.random()<.22?'sweep':'spark';
 if(kind==='sweep')return {k:kind,t:0,life:rnd(1.6,2.2),ang:rnd(-.6,.6)+(Math.random()<.5?0:Math.PI)};
 return {k:kind,t:0,life:rnd(1.1,1.8),cx:rnd(.18,.82),cy:rnd(.15,.85),r:rnd(.12,.24),peak:rnd(.75,1)}}
function frame(now){var dt=Math.min(.05,(now-last)/1000);last=now;x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,cv.width,cv.height);
 if(!base){requestAnimationFrame(frame);return}
 // the brain itself stays completely hidden: only the flashes reveal parts of it
 next-=dt;if(next<=0){F.push(spawn());if(Math.random()<.3)F.push(spawn());next=rnd(1.2,3.2)}
 if(tmp.width!==base.width||tmp.height!==base.height){tmp.width=base.width;tmp.height=base.height}
 for(var i=F.length-1;i>=0;i--){var f=F[i];f.t+=dt;var p=f.t/f.life;if(p>=1){F.splice(i,1);continue}
  tx.globalCompositeOperation='source-over';tx.clearRect(0,0,tmp.width,tmp.height);tx.drawImage(lit,0,0);tx.globalCompositeOperation='destination-in';
  var a;
  if(f.k==='spark'){ // a part of the brain ignites fast, then cools down slowly
   var up=Math.min(1,p/.12),down=p<.12?1:Math.pow(1-(p-.12)/.88,1.6);a=up*down*f.peak;
   var rr=f.r*tmp.height*(.7+.5*Math.min(1,p/.3)),g=tx.createRadialGradient(f.cx*tmp.width,f.cy*tmp.height,0,f.cx*tmp.width,f.cy*tmp.height,rr);
   g.addColorStop(0,'rgba(0,0,0,'+a+')');g.addColorStop(.45,'rgba(0,0,0,'+(a*.55)+')');g.addColorStop(1,'rgba(0,0,0,0)');tx.fillStyle=g;tx.fillRect(0,0,tmp.width,tmp.height);
  }else{            // a thin light band runs across the brain
   var L=Math.hypot(tmp.width,tmp.height),c=Math.cos(f.ang),s=Math.sin(f.ang),pos=(p*1.4-.2)*L,mx=tmp.width/2,my=tmp.height/2;
   var x0=mx+c*(pos-L/2),y0=my+s*(pos-L/2),bw=L*.09,g2=tx.createLinearGradient(x0-c*bw,y0-s*bw,x0+c*bw,y0+s*bw);a=Math.sin(Math.PI*Math.min(1,p*1.05))*.85;
   g2.addColorStop(0,'rgba(0,0,0,0)');g2.addColorStop(.5,'rgba(0,0,0,'+a+')');g2.addColorStop(1,'rgba(0,0,0,0)');tx.fillStyle=g2;tx.fillRect(0,0,tmp.width,tmp.height);
  }
  x.globalCompositeOperation='lighter';
  x.filter='blur('+Math.round(14*D)+'px)';x.globalAlpha=.75;x.drawImage(tmp,box.x,box.y);   // soft glow around the lit part
  x.filter='none';x.globalAlpha=1;x.drawImage(tmp,box.x,box.y);                              // crisp lit contours
  x.globalCompositeOperation='source-over'}
 requestAnimationFrame(frame)}
requestAnimationFrame(frame);
})();
