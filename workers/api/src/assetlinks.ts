// Android Trusted Web Activity statement shape (replace both placeholders):
// [
//   {
//     "relation": ["delegate_permission/common.handle_all_urls"],
//     "target": {
//       "namespace": "android_app",
//       "package_name": "<Android application ID>",
//       "sha256_cert_fingerprints": ["<SHA-256 signing certificate fingerprint>"]
//     }
//   }
// ]
export const ASSET_LINKS: {
  relation: string[];
  target: {
    namespace: 'android_app';
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}[] = [];
