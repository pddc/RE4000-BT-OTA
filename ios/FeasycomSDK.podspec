Pod::Spec.new do |s|
  s.name             = 'FeasycomSDK'
  s.version          = '1.0.4'
  s.summary          = 'Feasycom BLE SDK for iOS OTA firmware updates'
  s.description      = 'Static library wrapping the Feasycom FEBluetoothSDK for BLE OTA updates'
  s.homepage         = 'https://www.feasycom.com'
  s.license          = { :type => 'Proprietary' }
  s.author           = { 'Feasycom' => 'support@feasycom.com' }
  s.platform         = :ios, '11.0'
  s.source           = { :path => '.' }

  s.source_files     = 'FeasycomSDK/*.h'
  s.vendored_libraries = 'FeasycomSDK/libFEBluetoothSDK.a'
  s.public_header_files = 'FeasycomSDK/*.h'

  s.frameworks       = 'CoreBluetooth', 'Foundation'
  s.libraries        = 'c++'

  s.pod_target_xcconfig = {
    'VALID_ARCHS' => 'arm64 x86_64',
    'OTHER_LDFLAGS' => '-ObjC',
  }
end
