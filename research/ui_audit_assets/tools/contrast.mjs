const L=(h)=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]};
const cr=(a,b)=>{const [x,y]=[L(a),L(b)].sort((p,q)=>q-p);return ((x+0.05)/(y+0.05)).toFixed(2)};
const light={fg:"#111318",bg:"#ffffff",muted:"#565b66",id:"#1f3a5f",panel:"#f7f7f5",linesoft:"#d6d8dc",
 green:["#1e7a34","#e6f4ea"],amber:["#92600a","#fef3e2"],red:["#b3261e","#fce8e6"],caveat:["#12586f","#e2eef4"],gray:["#40464f","#eceef0"]};
const dark={fg:"#ececec",bg:"#14161a",muted:"#a3a8b3",id:"#8ab4ff",panel:"#1b1e24",linesoft:"#34373f",
 green:["#6fe39a","#123821"],amber:["#f2c14e","#3a2c0d"],red:["#f28b82","#3a1414"],caveat:["#7fd4ec","#0f2e38"],gray:["#c2c6cc","#24272d"]};
for (const [n,t] of [["light",light],["dark",dark]]) {
  console.log("==",n);
  console.log("fg/bg",cr(t.fg,t.bg),"muted/bg",cr(t.muted,t.bg),"muted/panel",cr(t.muted,t.panel),"id/bg",cr(t.id,t.bg),"linesoft/bg (non-text)",cr(t.linesoft,t.bg));
  for (const k of ["green","amber","red","caveat","gray"]) console.log(k,"fg/own-bg",cr(t[k][0],t[k][1]),"fg/page-bg",cr(t[k][0],t.bg),"fg/panel",cr(t[k][0],t.panel));
}
console.log("default link blue #0000ee on white",cr("#0000ee","#ffffff"),"on dark bg",cr("#0000ee","#14161a"),"dark default #9e9eff on #14161a",cr("#9e9eff","#14161a"));
console.log("placeholder default #757575 on white",cr("#757575","#ffffff"));
