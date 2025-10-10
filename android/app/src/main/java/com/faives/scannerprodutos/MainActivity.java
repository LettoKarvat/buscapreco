package com.faives.scannerprodutos;

import android.Manifest;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
  private static final int REQ_CAMERA = 1001;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // 1) Permissão de câmera em runtime (Android 6+)
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
        != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(
        this,
        new String[]{ Manifest.permission.CAMERA },
        REQ_CAMERA
      );
    }

    // 2) Ajustes do WebView do Capacitor
    WebView webView = getBridge().getWebView();
    WebSettings s = webView.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(true);
    s.setAllowContentAccess(true);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      // Se tiver assets http misturados com https (ideal é tudo https)
      s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
    }

    // 3) Conceder apenas VIDEO_CAPTURE p/ getUserMedia()
    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          runOnUiThread(() -> {
            String[] wants = request.getResources();
            boolean wantsVideo = false;
            for (String r : wants) {
              if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) {
                wantsVideo = true;
                break;
              }
            }
            if (wantsVideo) {
              request.grant(new String[]{ PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            } else {
              request.deny();
            }
          });
        }
      }
    });

    // 4) Debug opcional (sem depender de BuildConfig)
    if ( (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0 ) {
      WebView.setWebContentsDebuggingEnabled(true);
    }
  }

  @Override
  public void onRequestPermissionsResult(
    int requestCode, String[] permissions, int[] grantResults
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    // Deixe o Capacitor propagar o resultado
  }
}
