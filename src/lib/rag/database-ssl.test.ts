import {afterEach,describe,expect,it,vi} from 'vitest';
import {X509Certificate} from 'node:crypto';
import {databaseConnectionString,databaseSslConfiguration} from './database-ssl';

// Public self-signed SAN fixture only; its private key is not retained.
const publicCertificate=new X509Certificate("-----BEGIN CERTIFICATE-----\nMIIDODCCAiCgAwIBAgIUXEKh5foyTbTZHpsfP/yMeWHhW2UwDQYJKoZIhvcNAQEL\nBQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MTAyMTEwNDc1MFoXDTM2MTAx\nODEwNDc1MFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF\nAAOCAQ8AMIIBCgKCAQEAoWi89WD/3KSVIWqZ2MLYL2urdHSzZKUxsfUf48Jd9dIj\ngStydyK71lumoQhOdKsetE9XYiJIfxRlkyJNKhZs8tGEvyClD19o7yZK6W1kOqR7\neG7kaGARxKx+Btc0XIrjOot8y+qv48YU31bMq6SuC74GQRss/q5zUYz+GVxitPKj\nfd9NxIcEyhl2pLnjd6DFfUv3GrQtXopzkLttjSmjJ90gP2HABjmEGYjyZzsOKNqV\n82rZu3Kwz1B2kzeXWuA3DxkvypYUyAOYvCDE1rAjvR+8hOdjZv6YKaL48HASygl0\nriiXmI99GziGL+KjGY+SDiMzo2+QruMMzqBoRd5IZQIDAQABo4GBMH8wHQYDVR0O\nBBYEFN//duR1jhG009ghagKhIpbdfhFdMB8GA1UdIwQYMBaAFN//duR1jhG009gh\nagKhIpbdfhFdMA8GA1UdEwEB/wQFMAMBAf8wLAYDVR0RBCUwI4IJbG9jYWxob3N0\nhwR/AAABhxAAAAAAAAAAAAAAAAAAAAABMA0GCSqGSIb3DQEBCwUAA4IBAQBQKVFr\n/E9qPIafNvYlSzUD2vkw0NhfCIoD58/qN/5p42hKcICwBuwJyQktHIvjUbD+qlFT\nlvCp/8nz0pq0aAWzMTWXnRaQShIjw7YFTVKlSxDE/odfmF2R5mo1adwGLV/IWI/K\nYbC5hYP9R+RgegFou9gAPK2dI1VYfzKqi8w9KMGyz2Ci3d+wOyLNyPZ34uWJyCL9\n59PT0VhTZ9DdSlv3Vk2BKLpKzhuNmYyGkVzxXUKOAz+Qc97XSDCu9iM9BbxOqZbq\nuaPA/i8CykAOX/3L4heTV3wIveCXGPFfqaavTGafanRehYvyNM3MdmZoQ39e5Y8H\nCFiXcHnk8EnAfRQx\n-----END CERTIFICATE-----\n").toLegacyObject();

afterEach(()=>vi.unstubAllEnvs());
function verified(url:string){
 vi.stubEnv('DATABASE_SSL_CA','test-ca');
 const ssl=databaseSslConfiguration(url);if(!ssl)throw new Error('Expected TLS');return ssl;
}
describe('database certificate reference identity',()=>{
 it('rejects an unmatched IP even if the driver passes the matching localhost DNS name',()=>{
  const ssl=verified('postgres://user@127.0.0.2/database?sslmode=verify-full');
  expect(ssl.checkServerIdentity('localhost',publicCertificate)).toMatchObject({code:'ERR_TLS_CERT_ALTNAME_INVALID'});
  const matched=verified('postgres://user@127.0.0.1/database?sslmode=verify-full');
  expect(matched.checkServerIdentity('localhost',publicCertificate)).toBeUndefined();
  expect(ssl.rejectUnauthorized).toBe(true);expect(ssl.ca).toBe('test-ca');
 });
 it('pins the URL DNS name rather than trusting a driver-supplied name',()=>{
  const matched=verified('postgres://user@localhost/database?sslmode=verify-full');
  expect(matched.checkServerIdentity('other.invalid',publicCertificate)).toBeUndefined();
  const wrong=verified('postgres://user@database.example.invalid/database?sslmode=verify-full');
  expect(wrong.checkServerIdentity('localhost',publicCertificate)).toMatchObject({code:'ERR_TLS_CERT_ALTNAME_INVALID'});
 });
 it('checks actual IPv6 SANs and rejects a different IPv6 reference',()=>{
  const matched=verified('postgres://user@[::1]/database?sslmode=verify-full');
  expect(matched.checkServerIdentity('localhost',publicCertificate)).toBeUndefined();
  const wrong=verified('postgres://user@[::2]/database?sslmode=verify-full');
  expect(wrong.checkServerIdentity('localhost',publicCertificate)).toMatchObject({code:'ERR_TLS_CERT_ALTNAME_INVALID'});
 });
 it('retains strict identity for require and verify-ca modes',()=>{
  for(const mode of ['require','verify-ca']){
   const ssl=verified(`postgres://user@127.0.0.2/database?sslmode=${mode}`);
   expect(ssl.checkServerIdentity('localhost',publicCertificate)).toMatchObject({code:'ERR_TLS_CERT_ALTNAME_INVALID'});
  }
 });
 it('preserves local non-TLS behavior and strips pg TLS URL overrides',()=>{
  expect(databaseSslConfiguration('postgres://user@localhost/database')).toBe(false);
  const url=new URL(databaseConnectionString('postgres://user@localhost/database?sslmode=no-verify&sslrootcert=/different-ca&application_name=test'));
  expect(url.searchParams.has('sslmode')).toBe(false);expect(url.searchParams.has('sslrootcert')).toBe(false);
  expect(url.searchParams.get('application_name')).toBe('test');
 });
});
