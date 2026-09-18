'use strict';
// Gera client/public/imagens/login-rotina-equipe.svg: o padrão vetorial de ícones
// da rotina da equipe (xícara, balões, monitor, headset, relógio, agenda, caderno)
// que decora o lado esquerdo do login. Vetor fica nítido em qualquer tela.
//
//   node scripts/gerar-fundo-login.js
const fs = require('node:fs');
const path = require('node:path');

const L = 1600, A = 900;
const COR = '#58B98A';

const icones = {
  xicara: '<path d="M10 20h22v10a11 11 0 0 1-22 0z"/><path d="M32 24h3a5 5 0 0 1 0 10h-3"/><path d="M8 44h30"/><path d="M17 15c0-3 3-3 3-6M24 15c0-3 3-3 3-6"/>',
  balao: '<path d="M11 9h26a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H23l-8 7v-7h-4a6 6 0 0 1-6-6V15a6 6 0 0 1 6-6z"/>',
  baloes: '<path d="M8 7h20a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-4v5l-6-5H8a5 5 0 0 1-5-5V12a5 5 0 0 1 5-5z"/><path d="M37 19h1a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-3v5l-6-5H20a5 5 0 0 1-5-5v-3"/>',
  monitor: '<path d="M6 9h36a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V12a3 3 0 0 1 3-3z"/><path d="M24 35v7M15 42h18"/>',
  headset: '<path d="M8 30v-8a16 16 0 0 1 32 0v8"/><path d="M6 26h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6zM42 26h-5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h5z"/><path d="M40 38v2a4 4 0 0 1-4 4h-9"/>',
  relogio: '<circle cx="24" cy="24" r="17"/><path d="M24 13v11l7 5"/>',
  calendario: '<path d="M6 12h36v30a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z"/><path d="M6 21h36M15 7v9M33 7v9"/>',
  caderno: '<path d="M13 6h23a3 3 0 0 1 3 3v32a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z"/><path d="M10 12H6M10 19H6M10 26H6M10 33H6M10 40H6"/><path d="M19 14h12v6H19z"/>',
  brilho: '<path d="M24 14v6M24 28v6M14 24h6M28 24h6"/>',
};

// Gerador determinístico, para o arquivo ser sempre o mesmo.
let semente = 20260918;
function aleatorio() {
  semente |= 0; semente = (semente + 0x6D2B79F5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (a, b) => a + (b - a) * aleatorio();

const principais = ['xicara', 'balao', 'baloes', 'monitor', 'headset', 'relogio', 'calendario', 'caderno'];
const usos = [];
const passoX = 225, passoY = 190;
let ultimo = null;
for (let lin = 0; lin * passoY < A + passoY; lin += 1) {
  const desloca = lin % 2 ? passoX / 2 : 0;
  for (let col = 0; col * passoX - desloca < L + passoX; col += 1) {
    if (aleatorio() < 0.12) continue;
    let nome;
    do nome = principais[Math.floor(aleatorio() * principais.length)]; while (nome === ultimo);
    ultimo = nome;
    const x = col * passoX - desloca + entre(-30, 30);
    const y = lin * passoY + entre(-28, 28);
    const escala = entre(1.6, 2.1);
    const giro = entre(-16, 16);
    usos.push(`<use href="#${nome}" transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${giro.toFixed(0)}) scale(${escala.toFixed(2)})"/>`);
    if (aleatorio() < 0.45) {
      const bx = x + entre(70, 130), by = y + entre(-40, 60);
      usos.push(`<use href="#brilho" transform="translate(${bx.toFixed(0)} ${by.toFixed(0)}) rotate(${entre(-30, 30).toFixed(0)}) scale(${entre(0.9, 1.3).toFixed(2)})"/>`);
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${A}" width="${L}" height="${A}" role="img" aria-label="Rotina da equipe de atendimento">
<!-- Padrão decorativo do login. Gerado por scripts/gerar-fundo-login.js; edite lá, não aqui. -->
<defs>
${Object.entries(icones).map(([nome, corpo]) => `<g id="${nome}" fill="none" stroke="${COR}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${corpo}</g>`).join('\n')}
</defs>
${usos.join('\n')}
</svg>
`;
const saida = process.argv[2] || path.join(__dirname, '..', 'client', 'public', 'imagens', 'login-rotina-equipe.svg');
fs.writeFileSync(saida, svg);
console.log(`${saida}: ${Buffer.byteLength(svg)} bytes, ${usos.length} ícones`);
