# MS Fashion Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Owner-Only Mutations**: Only the verified business owner (`sohel901190@gmail.com` or an entry in `/admins/{uid}`) with `email_verified == true` may create, update, delete, or list any collection.
2. **No Public List Scraping**: Unauthenticated visitors may NEVER execute `list` queries on any collection (`suppliers`, `customers`, `transactions`, `homeExpenses`, `personalFinanceEntries`, `persons`, `personTransactions`, `publicSupplierLedgers`, `publicCustomerLedgers`, `publicPersonLedgers`, `publicHomeExpenseLedgers`, `publicInvoices`, `admins`).
3. **Scoped Public Shareable Statements (`get` only)**: Unauthenticated visitors opening `/?customer=ID`, `/?supplier=ID`, `/?person=ID`, `/?home=ID`, or `/?invoice=ID` may only perform single-document `get` reads against `/publicCustomerLedgers/{id}`, `/publicSupplierLedgers/{id}`, `/publicPersonLedgers/{id}`, `/publicHomeExpenseLedgers/{id}`, or `/publicInvoices/{id}` when `resource != null && resource.data.shareEnabled == true`.
4. **Immutable Ownership & Creation Timestamps**: `ownerUid` and `createdAt` must never change after document creation. `createdAt == request.time` on create and `updatedAt == request.time` on create/update.
5. **Strict Schema & Size Bounds**: Every document enforces exact `hasAll` + `hasOnly` key allowlists, ID regex `^[a-zA-Z0-9_\-]+$`, string `.size()` bounds, and bounded list sizes (`items.size() <= 50`, `entries.size() <= 250`).

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Supplier Create**: Anonymous user attempts `setDoc(doc(db, 'suppliers', 's1'), ...)` -> **PERMISSION_DENIED**.
2. **Unverified Admin Email Spoof**: User with `email: 'sohel901190@gmail.com'` and `email_verified: false` attempts write -> **PERMISSION_DENIED**.
3. **Unauthorized Authenticated User Read**: Random signed-in Google user (not admin) attempts `getDocs(collection(db, 'customers'))` -> **PERMISSION_DENIED**.
4. **Unauthenticated List Scraping**: Public visitor attempts `getDocs(collection(db, 'publicCustomerLedgers'))` -> **PERMISSION_DENIED**.
5. **PII Direct Read on Private Collection**: Public visitor attempts `getDoc(doc(db, 'customers', 'cust1'))` -> **PERMISSION_DENIED**.
6. **Shadow / Ghost Field Injection**: Admin or attacker includes `isSuperUser: true` on `suppliers` create -> **PERMISSION_DENIED** (`hasOnly` rejects).
7. **OwnerUid Spoofing**: Admin payload sets `ownerUid: 'other_uid'` instead of `request.auth.uid` -> **PERMISSION_DENIED**.
8. **Client Timestamp Forgery**: Payload sets `createdAt: new Date('2020-01-01')` instead of `request.time` -> **PERMISSION_DENIED**.
9. **Immutable Field Mutation**: Update attempts to alter `createdAt` or `ownerUid` -> **PERMISSION_DENIED**.
10. **ID Poisoning**: Document ID contains `/` or >128 chars or invalid characters -> **PERMISSION_DENIED** (`isValidId` rejects).
11. **Unbounded Array / DoW Attack**: Transaction `items` array has 51+ items or `publicLedger.entries` has 251+ items -> **PERMISSION_DENIED**.
12. **Self-Assigned Admin Escalation**: Non-admin authenticated user attempts `setDoc(doc(db, 'admins', uid), ...)` -> **PERMISSION_DENIED**.
