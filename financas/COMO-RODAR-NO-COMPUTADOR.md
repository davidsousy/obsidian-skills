# Como rodar o Finanças da Casa no seu computador

O app inteiro (telas + banco de dados) roda no seu computador, sem Vercel e sem Supabase na nuvem.
Os dados ficam guardados no próprio computador. Dá para abrir também pelo celular, na mesma rede Wi-Fi.

## 1. Instale duas coisas (uma vez só)

1. **Node.js** (versão LTS): https://nodejs.org → baixar e instalar (pode ir clicando em "Avançar").
2. **Docker Desktop**: https://www.docker.com/products/docker-desktop → instalar e **abrir**.
   - No Windows, o instalador pode pedir para reiniciar o computador ou instalar o "WSL". Aceite.
   - O Docker Desktop precisa estar aberto sempre que for usar o app (ícone da baleia na barra de tarefas).

## 2. Baixe o app (uma vez só)

No GitHub, abra o repositório **financas-da-casa** → botão verde **Code** → **Download ZIP**.
Extraia o ZIP numa pasta fácil de achar (por exemplo, Documentos\financas-da-casa).

## 3. Abra o app

- **Windows:** dois cliques em **`rodar-local.bat`**.
  Se aparecer um aviso de segurança, clique em "Executar". Se o Firewall perguntar sobre o Node.js,
  marque **Redes privadas** e permita (é isso que libera o acesso pelo celular).
- **Mac:** dois cliques em **`rodar-local.command`**.
  Se o Mac disser que o arquivo é de um desenvolvedor não identificado: botão direito → **Abrir** → **Abrir**.
- **Linux:** no terminal, dentro da pasta: `bash scripts/rodar-local.sh`.

Na primeira vez demora de 5 a 15 minutos (baixa o banco de dados e prepara o app). Nas próximas, uns 30 segundos.
Quando terminar, o navegador abre sozinho em **http://localhost:3000**, já no Painel, com as dívidas e os custos
de outubro. **Deixe a janela preta aberta** enquanto estiver usando.

## 4. No celular

Com o celular no **mesmo Wi-Fi** do computador, abra o endereço que aparece na janela, algo como
**http://192.168.0.10:3000**. O computador precisa estar ligado e com a janela aberta.

## 5. Para desligar

- Feche a janela preta: o app desliga.
- Para desligar também o banco e liberar memória: **`parar-local.bat`** (Windows) ou **`parar-local.command`** (Mac).
  Os dados continuam guardados; da próxima vez é só abrir o `rodar-local` de novo.

## Se algo der errado

| Mensagem | O que fazer |
|---|---|
| "Node.js não encontrado" | Instale o Node.js (passo 1) e abra de novo. |
| "O Docker está fechado" | Abra o Docker Desktop, espere aparecer que está rodando e abra de novo. |
| "O banco não ligou" | Feche e abra o Docker Desktop; rode o `parar-local` e depois o `rodar-local`. |
| Página com "Diagnóstico" | Mostra o que falta; mande um print. |
| Celular não abre | Confira se está no mesmo Wi-Fi e se o Firewall do Windows liberou o Node.js em redes privadas. |

## Bom saber

- **Sem login:** qualquer pessoa no mesmo Wi-Fi que souber o endereço consegue abrir o app.
- **Alertas por e-mail** só funcionam na versão publicada na Vercel (aqui não há o agendamento diário).
- **Os dados ficam só neste computador.** Desinstalar o Docker ou apagar os volumes dele apaga os dados.
  O app publicado na Vercel tem um banco separado; os dois não se misturam.
