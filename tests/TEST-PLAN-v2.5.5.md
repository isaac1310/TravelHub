# Manual test plan — v2.5.5

**Where:** phone: `http://<mac-ip>:8722`. Footer should read `TravelHub v2.5.5`.

**Automated:** `?selftest=1` on 8723. Phone width (375): 403 passed, 0 failed, 6 skipped. Desktop (1280):
385 passed, 0 failed, 24 skipped. The new checks fail with the old parser, which turns a fenced paste into
3 rows with no days.

**Fix:** a list pasted on the phone lost its days. On a phone the whole AI message gets copied (the
```json fence, a sentence before or after it), and keyboards swap `"` for `“ ”`. The importer now cuts out
the list itself and straightens the quotes.

## 1. ⚠️ Paste on the phone
1.1 On the phone, ask ChatGPT or Claude for a short list with the Copy prompt. **Long-press the answer →
Copy** (the whole message, not the code block's Copy button). Edit trip → Import places… → paste.
- **Expect:** one row per place, each with its **day** filled in and its type set. ☐

1.2 Paste only half of an AI answer (cut off mid-list).
- **Expect:** one red row: "This looks like the AI's list but couldn't be read…". Not a row per line. ☐

1.3 Paste two plain place names, one per line.
- **Expect:** two rows, as before. ☐

---
Version footer checked: ☐ `TravelHub v2.5.5`
