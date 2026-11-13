export const ASSET_LINKS: {
  relation: string[];
  target: {
    namespace: 'android_app';
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}[] = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'lk.mahiyanganaya.busdisplay',
        sha256_cert_fingerprints: [
          'B2:08:5A:CE:8A:3F:AD:59:1C:80:FF:CF:17:5D:F7:B9:A2:EE:38:F3:93:34:4C:56:1A:62:D6:C2:82:52:A8:EC',
        ],
      },
    },
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'lk.mahiyanganaya.busmobile',
        sha256_cert_fingerprints: [
          '11:96:BC:80:69:08:4E:44:FF:7F:31:A9:65:6D:0B:BA:90:BA:FB:67:D7:4D:CC:4B:2F:D7:73:A6:37:E2:84:DE',
        ],
      },
    },
  ];