update knowledge_embedding_profile_v3
set artifact_sha256='4f2ef0a2c9b4250206e9ddc202a2bbe01718aacd2a06f87e3e09887b2a076c28'
where profile_key='bge-m3-1024'
  and model_revision='5617a9f61b028005a4858fdac845db406aefb181'
  and artifact_sha256 is null;
