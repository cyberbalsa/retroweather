# Preserve @JavascriptInterface methods — required for WebView JS bridge
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
