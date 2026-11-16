# Reference vectors for embedding-reference.json, from the model's own library
# (sentence-transformers, with the original PyTorch weights). Not run by the tests.
#
#   python -m venv ref && ref/bin/pip install sentence-transformers
#   ref/bin/python embedding-reference.py sentences.json out.json <revision of sentence-transformers/all-MiniLM-L6-v2>
#
# sentences.json is a JSON array of strings (the "sentences" of embedding-reference.json).
# The first run fetches the weights from huggingface.co.
import json, sys
from sentence_transformers import SentenceTransformer
sentences = json.load(open(sys.argv[1]))
revision = sys.argv[3]
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", revision=revision, device="cpu")
vectors = model.encode(sentences, normalize_embeddings=True, batch_size=1)
tokens = [len(model.tokenizer(s, truncation=True, max_length=model.max_seq_length)["input_ids"]) for s in sentences]
ids = [model.tokenizer(s, truncation=True, max_length=model.max_seq_length)["input_ids"] for s in sentences]
import sentence_transformers, torch
json.dump({
  "library": f"sentence-transformers {sentence_transformers.__version__}, torch {torch.__version__}",
  "model": "sentence-transformers/all-MiniLM-L6-v2", "revision": revision,
  "maxSeqLength": model.max_seq_length, "tokens": tokens, "ids": ids,
  "vectors": [[round(float(x), 6) for x in v] for v in vectors],
}, open(sys.argv[2], "w"))
print("max_seq_length", model.max_seq_length, "tokens", tokens)
