// Colour-blindness simulation (Machado 2009 matrices, severity 1.0) of the number palettes.
const hex2 = (h) => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16) / 255);
const lin = (c) => c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055) ** 2.4;
const srgb = (c) => c <= 0.0031308 ? 12.92*c : 1.055*c**(1/2.4) - 0.055;
const M = {
  protan: [[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
  deutan: [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
  tritan: [[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]],
};
const sim = (rgb, m) => { const l = rgb.map(lin); return m.map(r => Math.min(1, Math.max(0, r[0]*l[0]+r[1]*l[1]+r[2]*l[2]))).map(srgb); };
// CIE Lab deltaE76
const toLab = (rgb) => { const l = rgb.map(lin); let x = (0.4124*l[0]+0.3576*l[1]+0.1805*l[2])/0.95047, y = 0.2126*l[0]+0.7152*l[1]+0.0722*l[2], z = (0.0193*l[0]+0.1192*l[1]+0.9505*l[2])/1.08883; const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787*t + 16/116; [x,y,z] = [x,y,z].map(f); return [116*y-16, 500*(x-y), 200*(y-z)]; };
const dE = (a, b) => Math.hypot(...toLab(a).map((v,i) => v - toLab(b)[i]));
const lum = (rgb) => { const l = rgb.map(lin); return 0.2126*l[0]+0.7152*l[1]+0.0722*l[2]; };
const cr = (a,b) => { const la = lum(a), lb = lum(b); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); };
const light = { 1:'#1565c0',2:'#2e7d32',3:'#c62828',4:'#1a237e',5:'#8d1c1c',6:'#00727d',7:'#212121',8:'#6d6d6d' };
const dark = { 1:'#82b1ff',2:'#81c784',3:'#ff8a80',4:'#b39ddb',5:'#ffab91',6:'#4dd0e1',7:'#eceff1',8:'#a0a8b4' };
// 3D palette: replicate textures.js
const hexToRgb255 = (h) => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));
const rgbToHex = (rgb) => '#' + rgb.map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
function hslToRgb(h,s,l){ s/=100; l/=100; const k=n=>(n+h/30)%12; const a=s*Math.min(l,1-l); const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))); return [f(0),f(8),f(4)].map(v=>v*255); }
const shade = (hex, amt) => rgbToHex(hexToRgb255(hex).map(v => v + (amt<0 ? v*amt : (255-v)*amt)));
const REVEALED_DARK = shade('#eef3fa', -0.06);
const c255 = (rgb) => rgb.map(v=>v/255);
const CLASSIC = ['#1565c0', '#2e7d32', '#d32f2f', '#1a237e', '#8d1c1c', '#00838f', '#212121', '#6d6d6d'];
const p3 = {};
for (let n = 1; n <= 26; n++) { let rgb; if (n <= 8) rgb = hexToRgb255(CLASSIC[n-1]); else { const t=n-9; const hue=(t*137.508+285)%360; rgb = hslToRgb(hue, 72+(t%2)*14, 34+(t%3)*5); }
  for (let it=0; it<60 && cr(c255(rgb), c255(hexToRgb255(REVEALED_DARK))) < 5.0; it++) rgb = rgb.map(v=>v*0.95); p3[n] = rgbToHex(rgb); }
function report(name, pal, bgHex) {
  console.log(`\n== ${name} (bg ${bgHex})`);
  const keys = Object.keys(pal);
  for (const [vis, m] of [['normal', null], ...Object.entries(M)]) {
    const pairs = [];
    for (let i = 0; i < keys.length; i++) for (let j = i+1; j < keys.length; j++) {
      const a = hex2(pal[keys[i]]), b = hex2(pal[keys[j]]);
      const sa = m ? sim(a, m) : a, sb = m ? sim(b, m) : b;
      const d = dE(sa, sb); if (d < 20) pairs.push(`${keys[i]}/${keys[j]}:${d.toFixed(0)}`);
    }
    console.log(` ${vis.padEnd(7)} confusable pairs (dE<20): ${pairs.length ? pairs.join(' ') : 'none'}`);
  }
  const bg = hex2(bgHex); const low = keys.filter(k => cr(hex2(pal[k]), bg) < 4.5).map(k => `${k}:${cr(hex2(pal[k]), bg).toFixed(2)}`);
  console.log(` contrast < 4.5 vs bg: ${low.length ? low.join(' ') : 'none'}`);
}
report('2D light numbers', light, '#eef3fa');
report('2D dark numbers', dark, '#2a3140');
console.log('3D palette', JSON.stringify(p3));
report('3D numbers 1-26', p3, REVEALED_DARK);
