(function(){
/* Eyes in the dark from the OAA eye artwork: open slowly, blink, close and vanish; alternate left/right. */
var cv=document.getElementById(window.OAA_EYES_CANVAS||'eyes2'),x=cv.getContext('2d'),W,H,D;
function size(){D=Math.min(devicePixelRatio||1,2.5);W=innerWidth;H=innerHeight;cv.width=Math.round(W*D);cv.height=Math.round(H*D);x.setTransform(D,0,0,D,0,0);x.imageSmoothingQuality='high'}
size();addEventListener('resize',size);
var SRC=(window.OAA_EYES||['/assets/lp/e5.webp','/assets/lp/e4.webp','/assets/lp/e1.webp','/assets/lp/e6.webp']).map(function(s){var i=new Image();i.src=s;return i});
function rnd(a,b){return a+Math.random()*(b-a)}
var E=[],side=1,MAX=W*H>900000?4:2;
function spawn(){var img=SRC[Math.floor(Math.random()*SRC.length)];if(!img.naturalWidth)return null;
 side=-side;var wide=W>800,half=Math.min(440,W*.45),w=rnd(150,185)*(W<700?.7:1),h=w*img.naturalHeight/img.naturalWidth,px,py,t=0;
 do{px=wide?(side<0?rnd(.03*W+w/2,W/2-half-w/2):rnd(W/2+half+w/2,.97*W-w/2)):(side<0?rnd(.05*W+w/2,.5*W-w/2):rnd(.5*W+w/2,.95*W-w/2));py=rnd(.07*H+h,.93*H-h);t++}
 while(t<60&&E.some(function(o){return Math.abs(o.x-px)<(o.w+w)*.55&&Math.abs(o.y-py)<(o.h+h)*.9}));
 if(t>=60)return null;
 var life=rnd(4.5,8),bl=[rnd(1.3,life-1.3)];if(Math.random()<.55)bl.push(rnd(1.3,life-1.3));
 return {img:img,x:px,y:py,w:w,h:h,t:0,life:life,blinks:bl,drift:rnd(0,6.28)}}
var last=performance.now(),cool=2;
function frame(now){var dt=Math.min(.05,(now-last)/1000);last=now;x.clearRect(0,0,W,H);
 cool-=dt;if(E.length<MAX&&cool<=0){var n=spawn();if(n){E.push(n);cool=rnd(2.5,5.5)}}
 x.globalCompositeOperation='lighter';
 for(var i=E.length-1;i>=0;i--){var e=E[i];e.t+=dt;if(e.t>e.life){E.splice(i,1);continue}
  var open=e.t<.7?1-Math.pow(1-e.t/.7,3):e.t>e.life-.7?Math.max(0,(e.life-e.t)/.7):1;   // eyelids open / close
  for(var k=0;k<e.blinks.length;k++){var d=Math.abs(e.t-e.blinks[k]);if(d<.12)open*=Math.max(.04,d/.12)}
  var a=Math.min(1,open*1.6),hh=e.h*Math.max(.03,open),dy=Math.sin(now/1300+e.drift)*1.5;
  x.globalAlpha=a;x.drawImage(e.img,e.x-e.w/2,e.y-hh/2+dy,e.w,hh)}
 x.globalAlpha=1;x.globalCompositeOperation='source-over';
 requestAnimationFrame(frame)}
requestAnimationFrame(frame);
})();
