package com.rangai.manga;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hosts the bundled web UI (assets/www) in a WebView and gives it a small, safe native bridge:
 * HTTPS requests (so image APIs work without CORS limits), save to the phone gallery, and share.
 * Only pages from the app's own asset host can use the bridge; other links open in the browser.
 */
public class MainActivity extends Activity {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_HOST + "/assets/www/index.html";
    private static final int REQ_FILE = 41;
    private static final int REQ_STORAGE = 42;
    private static final int MAX_RESPONSE_BYTES = 30 * 1024 * 1024;
    private static final String BG = "#0C0C11";

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private ValueCallback<Uri[]> fileCallback;
    private final ExecutorService executor = Executors.newFixedThreadPool(3);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final int bg = Color.parseColor(BG);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(bg);
        webView = new WebView(this);
        webView.setBackgroundColor(bg);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        setupEdgeToEdge(root);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(true);

        webView.addJavascriptInterface(new Bridge(), "RangNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_HOST.equals(uri.getHost())) return false;
                openExternal(uri);
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                try {
                    startActivityForResult(Intent.createChooser(intent, "Choose a picture"), REQ_FILE);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }
    }

    @SuppressWarnings("deprecation")
    private void setupEdgeToEdge(View root) {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                left = bars.left;
                top = bars.top;
                right = bars.right;
                bottom = Math.max(bars.bottom, ime.bottom);
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(left, top, right, bottom);
            return insets;
        });
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // no browser installed
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getData() != null) {
                        result = new Uri[]{data.getData()};
                    } else if (data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                        result = new Uri[]{data.getClipData().getItemAt(0).getUri()};
                    }
                }
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView == null) {
            finish();
            return;
        }
        webView.evaluateJavascript(
                "(window.__onBack && window.__onBack()) ? 'handled' : 'no'",
                value -> {
                    if (value == null || !value.contains("handled")) finish();
                });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        if (webView != null) {
            webView.removeJavascriptInterface("RangNative");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /* ---------------- helpers ---------------- */

    private static byte[] readAll(InputStream in) throws IOException {
        try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int n;
            int total = 0;
            while ((n = is.read(buf)) != -1) {
                total += n;
                if (total > MAX_RESPONSE_BYTES) throw new IOException("Response too large");
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }
    }

    private static String safeMime(String mime) {
        if ("image/png".equals(mime) || "image/jpeg".equals(mime) || "image/webp".equals(mime)) return mime;
        return "image/jpeg";
    }

    private static String safeName(String name, String mime) {
        String base = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (base.isEmpty()) base = "rang-manga-" + System.currentTimeMillis();
        if (base.length() > 80) base = base.substring(0, 80);
        String ext = "image/png".equals(mime) ? ".png" : "image/webp".equals(mime) ? ".webp" : ".jpg";
        if (!base.toLowerCase(Locale.ROOT).endsWith(ext)) base = base + ext;
        return base;
    }

    private void deliver(String id, String json) {
        final String js = "window.__nativeHttpDone && window.__nativeHttpDone("
                + JSONObject.quote(id) + "," + JSONObject.quote(json) + ")";
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(js, null);
        });
    }

    /* ---------------- bridge used by app.js ---------------- */

    private class Bridge {

        /** Async HTTPS request. Result is sent back to window.__nativeHttpDone(id, json). */
        @JavascriptInterface
        public void http(final String requestJson) {
            executor.execute(() -> {
                String id = "";
                JSONObject res = new JSONObject();
                HttpURLConnection conn = null;
                try {
                    JSONObject req = new JSONObject(requestJson);
                    id = req.optString("id", "");
                    String url = req.getString("url");
                    if (!url.startsWith("https://")) {
                        throw new IllegalArgumentException("Only secure (https) addresses are allowed");
                    }
                    String method = req.optString("method", "GET").toUpperCase(Locale.ROOT);
                    if (!method.equals("GET") && !method.equals("POST") && !method.equals("DELETE")) {
                        throw new IllegalArgumentException("Method not allowed");
                    }
                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setRequestMethod(method);
                    conn.setConnectTimeout(30000);
                    conn.setReadTimeout(120000);
                    conn.setInstanceFollowRedirects(true);
                    JSONObject headers = req.optJSONObject("headers");
                    if (headers != null) {
                        Iterator<String> keys = headers.keys();
                        while (keys.hasNext()) {
                            String k = keys.next();
                            conn.setRequestProperty(k, headers.optString(k));
                        }
                    }
                    if (req.has("body") && !req.isNull("body")) {
                        byte[] body = req.getString("body").getBytes(StandardCharsets.UTF_8);
                        conn.setDoOutput(true);
                        conn.setFixedLengthStreamingMode(body.length);
                        try (OutputStream os = conn.getOutputStream()) {
                            os.write(body);
                        }
                    }
                    int status = conn.getResponseCode();
                    InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                    byte[] data = in == null ? new byte[0] : readAll(in);
                    res.put("status", status);
                    String ct = conn.getContentType();
                    res.put("contentType", ct == null ? "" : ct);
                    String retry = conn.getHeaderField("Retry-After");
                    if (retry != null) res.put("retryAfter", retry);
                    if (req.optBoolean("binary", false) && status < 400) {
                        res.put("body", Base64.encodeToString(data, Base64.NO_WRAP));
                    } else {
                        res.put("body", new String(data, StandardCharsets.UTF_8));
                    }
                } catch (Exception e) {
                    try {
                        res.put("status", 0);
                        res.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
                    } catch (Exception ignored) {
                        // cannot happen with plain values
                    }
                } finally {
                    if (conn != null) conn.disconnect();
                }
                deliver(id, res.toString());
            });
        }

        /** Saves an image to Pictures/Rang Manga. Returns "ok", "permission" or "error:...". */
        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public String saveImage(String base64, String mime, String name) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String type = safeMime(mime);
                String fileName = safeName(name, type);

                if (Build.VERSION.SDK_INT < 29) {
                    if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                            != PackageManager.PERMISSION_GRANTED) {
                        runOnUiThread(() -> requestPermissions(
                                new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE));
                        return "permission";
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_PICTURES), "Rang Manga");
                    if (!dir.exists() && !dir.mkdirs()) return "error:Could not create the folder";
                    File f = new File(dir, fileName);
                    try (FileOutputStream fos = new FileOutputStream(f)) {
                        fos.write(data);
                    }
                    MediaScannerConnection.scanFile(MainActivity.this,
                            new String[]{f.getAbsolutePath()}, new String[]{type}, null);
                    return "ok";
                }

                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Images.Media.MIME_TYPE, type);
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Rang Manga");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
                Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) return "error:Could not create the file";
                try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                    if (os == null) return "error:Could not open the file";
                    os.write(data);
                }
                ContentValues done = new ContentValues();
                done.put(MediaStore.Images.Media.IS_PENDING, 0);
                getContentResolver().update(uri, done, null, null);
                return "ok";
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }

        /** Opens the Android share sheet for an image. Returns "ok" or "error:...". */
        @JavascriptInterface
        public String shareImage(String base64, String mime, String name) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String type = safeMime(mime);
                File dir = new File(getCacheDir(), "shared");
                if (!dir.exists() && !dir.mkdirs()) return "error:Could not prepare the file";
                File f = new File(dir, safeName(name, type));
                try (FileOutputStream fos = new FileOutputStream(f)) {
                    fos.write(data);
                }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(type);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                final Intent chooser = Intent.createChooser(send, "Share image");
                runOnUiThread(() -> {
                    try {
                        startActivity(chooser);
                    } catch (ActivityNotFoundException ignored) {
                        // nothing can share
                    }
                });
                return "ok";
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "1.0";
            }
        }
    }
}
