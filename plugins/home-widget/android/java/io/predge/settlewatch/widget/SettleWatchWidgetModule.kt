package io.predge.settlewatch.widget

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

/** JS entry point: SettleWatchWidget.update(json) stores the summary and redraws the widget. */
class SettleWatchWidgetModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = "SettleWatchWidget"

  @ReactMethod
  fun update(json: String, promise: Promise) {
    try {
      JSONObject(json) // reject malformed input instead of storing it
      val ctx = reactApplicationContext.applicationContext
      ctx.getSharedPreferences(SettleWatchWidgetProvider.PREFS, Context.MODE_PRIVATE)
        .edit().putString(SettleWatchWidgetProvider.KEY, json).apply()
      SettleWatchWidgetProvider.refreshAll(ctx)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("widget_update_failed", e.message, e)
    }
  }
}
