# Diagnóstico Técnico - MALALA STORE

Conforme solicitado, segue o relatório de diagnóstico estruturado para garantir a entrega da versão de lançamento funcional e segura.

## 1. O que falta para o lançamento de quinta-feira (Blockers e Pendências)

### A. Integração de Cartão de Crédito Mercado Pago (Tokenização Falsa)
No frontend (`index.html`), a submissão de pagamento por cartão de crédito envia um token estático (fake):
```javascript
token: 'TEST_CARD_TOKEN_' + Date.now(),
payment_method_id: 'visa',
```
**Impacto:** É um impeditivo total para o checkout em produção via cartão de crédito. É obrigatório implementar o **Mercado Pago CardForm** (ou `createCardToken`) real para gerar o token criptografado antes de enviar ao backend. O backend (`server/server.js`) recebe esse token mas não o repassa pro SDK na estrutura que o SDK V2 exige para cartões reais.

### B. Fallback Automático para Teste (Inseguro em Produção)
Quando há falha na requisição ao backend (por exemplo `abort` / `timeout`), o catch na função `handleCheckoutSubmit` entra automaticamente em um modo "Demonstração", criando um pedido falso, aprovando o pagamento localmente, e salvando o pedido diretamente no Firebase a partir do Frontend:
**Impacto:** Fraude iminente. Um usuário mal intencionado bloqueando o acesso ao backend consegue forçar a criação de um pedido com status 'Pago' direto no Firebase (pela chamada `saveLocalDemoOrder`). Esse comportamento deve ser removido para o ambiente de produção.

### C. Segurança no Firebase Auth & Firestore Rules (Inconsistência)
No `firestore.rules`:
```javascript
function isAdmin() {
  return request.auth != null && request.auth.token.email == 'victorhugopenny@gmail.com';
}
```
No `admin.html`:
```javascript
const adminEmail = 'malalastore.pedidos@gmail.com';
```
**Impacto:** O email usado para login no painel (`malalastore.pedidos@gmail.com`) é diferente do email autorizado pelas regras do Firestore (`victorhugopenny@gmail.com`). Assim, o painel de admin conseguirá fazer login mas receberá erros de "Permission Denied" ao tentar escrever catálogos ou atualizar pedidos.

### D. Envio de Pedido via Frontend
No `saveLocalDemoOrder` (`index.html`), o cliente escreve diretamente na coleção `/orders`. As regras no `firestore.rules` dizem `allow create: if true;`, o que permite que *qualquer pessoa* adicione pedidos falsos sem restrição, com status que quiser.

---

## 2. O que precisa melhorar (Otimização e Segurança)

### A. Condições de Corrida no Estoque (Race Condition)
Tanto no backend (rota `/api/payments/card` e webhook) quanto no frontend (função `decrementStock` que ainda está sendo chamada mesmo com o backend processando), a leitura e escrita do estoque é feita buscando o array inteiro `products` e regravando ele todo.
**Riscos:** Se duas pessoas comprarem ao mesmo tempo, a última que salvar o documento reescreverá o estoque anterior, ignorando compras concorrentes. Ideal seria reestruturar para não ser um mega array, ou utilizar `FieldValue.arrayRemove`/`arrayUnion`, ou transações do Firestore no backend.

### B. Validações Módulo 11 (CPF) e Algoritmo de Luhn
- **CPF:** A validação Módulo 11 está funcional no frontend, mas no backend, ela não existe.
- **Cartão de Crédito:** O Algoritmo de Luhn está implementado corretamente e a UI funciona com a trava "anti-zeros". Porém, backend confia 100% no que o cliente manda.

### C. Gestão de Senhas do Firebase
A API Key do Firebase está hardcoded tanto no `index.html`, quanto no `minha-conta.html`, `admin.html`. É uma prática normal do Firebase no frontend, mas associado às regras frouxas (`allow create: if true`), torna o sistema altamente vulnerável a SPAM no banco de dados.

### D. Tratamento de Erros e Experiência (UX)
Os erros do backend, especialmente do Mercado Pago (cartão rejeitado, saldo insuficiente), não estão devidamente tratados na API de `/api/payments/card` (retorna só sucesso/falha de DB). O cliente final precisa saber por que o cartão foi recusado (se foi limite, erro na digitação, etc.).

---

## 3. O que já está perfeito (Pronto para Produção)

### A. Estrutura UI/UX com Tailwind (Mobile-first e Design System)
A apresentação gráfica, os modals (Checkout, Produto, Auth), as classes de Tailwind, badges flutuantes e responsividade estão excelentes. A conversão da página em si está muito fluida.
- O *Offcanvas* do carrinho, modal de *Quick View* do produto, e toast de notificações estão bem feitos e não precisam de refatoração de código.

### B. EmailJS Integration
O fluxo de disparo de e-mails (`enviarEmailConfirmacaoEmailJS`) via SDK do browser, com o respectivo template id configurado na UI, funciona muito bem e de maneira totalmente assíncrona, não interferindo na performance do checkout.

### C. Funções Utilitárias de UI
- `isValidCPF` e `isValidLuhn` no client-side: O código base em regex e soma ponderada cumpre o requisito de bloquear tentativas preguiçosas.
- O sistema de buscas dinâmico via `filterProducts` (texto, marcas e categorias) operando de forma imediata em memória está extremamente ágil para catálogos pequenos.

### D. Conexão Base com Mercado Pago SDK V2 no Backend
O setup do Mercado Pago usando a classe `MercadoPagoConfig` e `Payment` está no formato atual e validado (na parte de PIX, já cria certinho `paymentData` com as novas exigências de estrutura de `payer.identification`).

---
**Recomendação de Próximos Passos:** Antes do lançamento, o foco absoluto deve ser substituir o token falso do cartão pela integração real do script do Mercado Pago e corrigir as regras de Admin no Firebase. Não criei novos blocos de código neste momento.