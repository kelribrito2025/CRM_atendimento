#!/bin/bash
# Inicia o CRM no Mac: clique duas vezes neste arquivo.
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js não encontrado."
  echo "Instale a versão LTS em https://nodejs.org e depois abra este arquivo de novo."
  echo
  read -r -p "Pressione Enter para fechar."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando o que o sistema precisa. Isso acontece só na primeira vez..."
  if ! npm install --no-audit --no-fund; then
    echo
    echo "Não foi possível instalar. Verifique a conexão com a internet e tente de novo."
    read -r -p "Pressione Enter para fechar."
    exit 1
  fi
fi

echo
echo "Iniciando o CRM. O navegador vai abrir em http://localhost:3100"
echo "Para parar o sistema, feche esta janela."
echo
(sleep 3; open "http://localhost:3100") &
npm start
