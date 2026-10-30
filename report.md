# Relatório de Auditoria e Revisão - Malala Store

## 1. Status Geral de Conclusão (Front-end e Fluxo de Usuário)
O fluxo principal do e-commerce (Home -> Carrinho -> Checkout -> Autenticação -> Minha Conta) está implementado e funcional de forma isolada, porém há pontos de atenção:
- **Fluxo do Usuário:** O login/cadastro modal funciona, a adição ao carrinho com controle de estoque visual funciona, e o modal de checkout (com divisão entre envio e pagamento) está operante.
- **Painel "Minha Conta":** O arquivo `minha-conta.html` consegue ler as compras do usuário e apresenta uma linha do tempo de entrega (Recebido, Em Separação, A Caminho, Entregue).
- **Checkout:** Possui integrações mapeadas para PIX e Cartão (atualmente gerando um mock de demonstração no frontend). A chamada real ao backend (Render) precisa de validações mais restritas. A função de redirecionamento para o WhatsApp para compras via chat está funcional.

## 2. Políticas Comerciais e Blindagem Legal
**Status:** Inexistente.
A loja não possui atualmente a blindagem legal obrigatória para operar no Brasil.
- Não existem links no rodapé (`index.html`) para: Termos de Uso, Política de Privacidade, Política de Trocas e Devoluções, ou Prazos de Entrega.
- Falta o aceite explícito (checkbox) no formulário de checkout ("Li e concordo com os Termos e Condições").
- Não há informações de CNPJ, Endereço Físico ou Contato Oficial explícitos no rodapé (Apenas um link para WhatsApp).

## 3. Auditoria do Painel Admin (`admin.html`)
O painel do lojista está funcional para operações CRUD básicas de produtos, mas falta eficiência administrativa:
- **O que está bom:** Gestão do catálogo (adicionar, editar, apagar, busca de produtos) sincronizado via localStorage/Firestore e visualização de pedidos com status de entrega ajustável.
- **O que falta:**
  1. **Dashboard Financeiro:** Falta um resumo visual (faturamento total, ticket médio, número de vendas).
  2. **Controle Manual de Pagamentos:** Atualmente os pagamentos dependem de webhook do Mercado Pago. Falta um botão no admin para alterar um pagamento de "Pendente" para "Pago" ou "Cancelado" manualmente.
  3. **Edição Rápida na Tabela:** Alterar preço ou estoque exige abrir o modal inteiro do produto, em vez de um "inline-edit" direto na linha da tabela.
  4. **Filtros de Pedidos:** Não é possível filtrar os pedidos por data (hoje, última semana) ou por status de pagamento (ex: ver apenas pedidos pendentes).

## 4. Segurança e Tratamento de Erros
- **Regras do Firestore:** O projeto não contém um arquivo `firestore.rules`. É vital garantir que a coleção `orders` só possa ser lida pelo usuário dono do pedido ou pelo Admin. Se estiver em "modo teste" no Firebase, a loja está vulnerável a injeção e deleção de dados.
- **Validação de Formulários:** Os formulários de checkout baseiam-se principalmente nas propriedades `required` do HTML5. Falta validação rígida via JavaScript (Regex) para CPF, formato de Cartão de Crédito e CEP antes do envio para a API de pagamento.
- **Carrinho e Estoque:** O controle de estoque avisa e impede adicionar mais itens do que o disponível, mas a verificação é feita majoritariamente no frontend. Em um cenário real, uma verificação dupla (frontend + backend) deve ocorrer no momento final da cobrança para evitar overselling (venda sem estoque).

---

## 5. Checklist Priorizado de Implementação

### 🔴 Alta Prioridade (Obrigatório antes do lançamento)
- [ ] **Blindagem Legal (Políticas e Termos):** Criar páginas de Política de Privacidade, Trocas/Devoluções e Prazos de Entrega. Adicionar links no rodapé.
- [ ] **Checkbox de Aceite no Checkout:** Adicionar "Li e concordo com os Termos" antes do botão de pagamento.
- [ ] **Rodapé Legal:** Incluir CNPJ e Razão Social da empresa no rodapé.
- [ ] **Regras de Segurança do Firebase (Firestore Rules):** Configurar regras estritas no console do Firebase para proibir gravação anônima irrestrita em `products` e `orders`.
- [ ] **Validações Fortes no Frontend:** Implementar máscaras e validação real (algoritmo de módulo 11 para CPF, máscara de CEP, etc) no formulário de checkout.
- [ ] **Validação Dupla de Estoque:** O `server.js` deve checar o estoque real do Firestore antes de processar o pagamento via Mercado Pago, retornando erro se não houver disponibilidade.

### 🟡 Média Prioridade (Melhoria da Operação Diária)
- [ ] **Filtros de Pedidos no Admin:** Criar filtros por Data, Status de Pagamento (Pago/Pendente) e Status de Entrega.
- [ ] **Dashboard Resumo no Admin:** Adicionar um quadro simples no topo com "Faturamento do Mês" e "Pedidos Pendentes".
- [ ] **Atualização Manual de Pagamento:** Permitir que o Admin altere forçosamente o status de pagamento de um pedido caso o webhook do Mercado Pago falhe.
- [ ] **Edição Rápida de Estoque (Inline):** Permitir alterar a quantidade de estoque diretamente na tabela de produtos no `admin.html`.

### 🟢 Baixa Prioridade (Diferenciais e Otimizações Futuras)
- [ ] **Recuperação de Carrinho Abandonado:** Disparo de e-mail ou WhatsApp para usuários que iniciaram checkout mas não concluíram.
- [ ] **E-mails de Confirmação:** O sistema pode disparar um e-mail de "Pedido Confirmado" ou "Pedido Enviado" automático além da mudança no painel (possível de fazer via Firebase Extensions).
- [ ] **Botão "Comprar Novamente":** Na aba `minha-conta.html`, adicionar um botão para repor os itens de um pedido antigo direto no carrinho.
