# Relatório de Auditoria e Revisão - Malala Store (Revisão v2)

Após a última atualização, foi feita uma nova auditoria para verificar a resolução dos itens de Alta Prioridade apontados no relatório anterior.

## O que FOI RESOLVIDO (Excelente trabalho!):
- ✅ **Blindagem Legal (Políticas e Termos):** A página `termos.html` foi criada contendo Termos de Uso, Política de Privacidade (LGPD), Trocas e Prazos de Envio. Os links foram devidamente adicionados.
- ✅ **Checkbox de Aceite no Checkout:** O checkbox `payTerms` foi adicionado no modal de checkout obrigando o aceite das políticas e termos.
- ✅ **Rodapé Legal:** O CNPJ (`68.931.318/0001-20`) e a Razão Social (`MALALA STORE LTDA`) foram incluídos no rodapé do `index.html`.

## O que AINDA NÃO FOI RESOLVIDO (Falta implementar):
- ❌ **Regras de Segurança do Firebase (Firestore Rules):** O repositório ainda não contém um arquivo `firestore.rules` (ou `firebase.json`). Lembre-se que essa configuração muitas vezes é feita diretamente no Console do Firebase (na aba Firestore Database > Rules). Se você já fez isso lá, excelente! Mas se não, a base de dados ainda está vulnerável.
- ❌ **Validações Fortes no Frontend:** Embora os campos `payCpf` e `payCep` existam com a propriedade `required`, ainda não há validação via JavaScript. Um usuário pode digitar `123` no CPF e o sistema aceitará. Faltam funções de máscara e validação de Módulo 11 para o CPF.
- ❌ **Validação Dupla de Estoque:** O backend (`server/server.js`) ainda não faz a verificação do estoque atual no Firestore *antes* de enviar a cobrança para o Mercado Pago. A checagem continua sendo feita apenas no lado do cliente (`index.html`).

---

### Próximos Passos (Recomendação):
Se quiser, eu (Jules) posso escrever o código para:
1. **Adicionar máscaras e validação real de CPF/CEP** no arquivo `index.html`.
2. **Adicionar a trava de estoque** no arquivo `server/server.js` para garantir que ninguém compre um produto que acabou de esgotar.

Como você prefere seguir?
