update knowledge_embedding_profile_v3
set model_revision='5617a9f61b028005a4858fdac845db406aefb181'
where profile_key='bge-m3-1024'
  and model='BAAI/bge-m3'
  and dimensions=1024
  and model_revision='pending-exact-revision-before-build';
