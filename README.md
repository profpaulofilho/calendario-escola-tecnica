# Calculadora de Fase Prática

Aplicação web estática para uso no GitHub Pages.

## Novidades — Etapa I (fase escolar SENAI) e Etapa II (fase prática EMPRESA)
- **Etapa I – Fase escolar SENAI:** leitura automática do PDF do cronograma da unidade (`pdf-calendar-parser.js`): dias de aula, feriados e dias sem aula/recesso, carga horária, aulas por dia, turno e horário. Aceita PDF com texto (qualquer layout: grade semanal ou linha do tempo, inclusive girado) e PDF digitalizado/imagem (OCR com Tesseract.js + cor das células). Se o PDF não puder ser lido, os dados podem ser informados manualmente.
- **Etapa II – Formato da fase prática EMPRESA**, com início calculado automaticamente:
  - **Subsequente:** a prática inicia após a conclusão da fase escolar.
  - **Concomitante:** inicia após 10% da carga horária da fase escolar, no turno oposto às aulas (mesmos dias).
  - **Dual:** inicia após 10% da carga horária da fase escolar, em dias alternados (somente dias sem aula).
- Os dois modos de cálculo da prática continuam valendo (início + carga horária / início + data final).
- Clique em um dia do calendário para marcar/desmarcar aula SENAI e deixar igual ao PDF da unidade.
- PDF final com os dias sinalizados por etapa: **azul = Etapa I**, **verde = Etapa II**, **diagonal = as duas no mesmo dia (concomitante)**, marcador **10%**, página "Resumo do contrato – Etapas I e II" e anexo com o PDF da unidade.
- Desmarcando "Incluir Etapa I no cronograma", a calculadora funciona exatamente como antes.

## O que mudou na versão anterior
- Interface simplificada para usuário leigo
- Campo do nome do aprendiz em destaque
- Tema claro e escuro
- Favicon interno do projeto
- PDF com capa, resumo e calendário completo
- Passo a passo de uso dentro da própria aplicação

## Como publicar no GitHub Pages
1. Crie um repositório no GitHub.
2. Envie os arquivos desta pasta.
3. Em **Settings > Pages**, selecione a branch principal e a pasta raiz.
4. Aguarde a publicação.

## Como usar
1. Preencha os dados principais.
2. Etapa I: anexe o PDF da unidade e informe período e carga horária das aulas.
3. Etapa II: escolha o formato da prática.
4. Cadastre pausas, se houver.
5. Gere o calendário e baixe o PDF.
