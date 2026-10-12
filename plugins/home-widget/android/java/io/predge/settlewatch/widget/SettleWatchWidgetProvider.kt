package io.predge.settlewatch.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import io.predge.settlewatch.R
import org.json.JSONObject

/**
 * Home-screen widget: watchlist counts, the market that most needs attention, streak and
 * the time of the last check. The app writes an already-translated summary into
 * SharedPreferences (see SettleWatchWidgetModule); this class only draws it, so it also
 * works when Android refreshes the widget on its own schedule with the app closed.
 *
 * Source of truth: plugins/home-widget/android. The plugin plugins/with-home-widget.js copies
 * these files into android/ on every `expo prebuild`, so edit them there.
 */
class SettleWatchWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) manager.updateAppWidget(id, build(context))
  }

  companion object {
    const val PREFS = "settle_watch_widget"
    const val KEY = "summary"

    private val TILE_COUNT = intArrayOf(R.id.sw_count_caution, R.id.sw_count_watch, R.id.sw_count_ok, R.id.sw_count_resolved)
    private val TILE_LABEL = intArrayOf(R.id.sw_label_caution, R.id.sw_label_watch, R.id.sw_label_ok, R.id.sw_label_resolved)
    private val LEVELS = arrayOf("caution", "watch", "ok", "resolved")
    private val DEFAULT_LABELS = arrayOf("CAUTION", "WATCH", "QUIET", "SETTLED")

    /** Redraws every placed instance of the widget from the stored summary. */
    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, SettleWatchWidgetProvider::class.java))
      if (ids.isEmpty()) return
      val views = build(context)
      for (id in ids) manager.updateAppWidget(id, views)
    }

    fun levelColor(level: String): Int = when (level) {
      "caution" -> Color.parseColor("#e2703a")
      "watch" -> Color.parseColor("#b98bff")
      "ok" -> Color.parseColor("#9fb0a3")
      "resolved" -> Color.parseColor("#86e28a")
      else -> Color.parseColor("#93a898")
    }

    private fun fill(tpl: String, n: Long): String = tpl.replace("{n}", n.toString())

    /** Same thresholds as the app's ago(): seconds, minutes, hours, days. */
    fun relative(time: JSONObject?, checkedAt: Long, now: Long): String {
      if (checkedAt <= 0L) return time?.optString("never", "never") ?: "never"
      val s = Math.max(0L, Math.round((now - checkedAt) / 1000.0))
      return when {
        s < 60 -> fill(time?.optString("s", "{n}s ago") ?: "{n}s ago", s)
        s < 3600 -> fill(time?.optString("m", "{n}m ago") ?: "{n}m ago", Math.round(s / 60.0))
        s < 86400 -> fill(time?.optString("h", "{n}h ago") ?: "{n}h ago", Math.round(s / 3600.0))
        else -> fill(time?.optString("d", "{n}d ago") ?: "{n}d ago", Math.round(s / 86400.0))
      }
    }

    fun build(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.settle_watch_widget)
      val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
      val data = try { if (raw != null) JSONObject(raw) else null } catch (e: Exception) { null }

      views.setTextViewText(R.id.sw_brand, data?.optString("brand", "SETTLE WATCH") ?: "SETTLE WATCH")

      val tiles = data?.optJSONArray("tiles")
      for (i in LEVELS.indices) {
        val tile = tiles?.optJSONObject(i)
        views.setTextViewText(TILE_COUNT[i], if (data == null) "-" else (tile?.optInt("count", 0) ?: 0).toString())
        views.setTextViewText(TILE_LABEL[i], tile?.optString("label", DEFAULT_LABELS[i]) ?: DEFAULT_LABELS[i])
      }

      val streak = data?.optInt("streak", 0) ?: 0
      val streakLabel = data?.optString("streakLabel", "DAY STREAK") ?: "DAY STREAK"
      views.setTextViewText(R.id.sw_streak, "$streak $streakLabel")
      views.setTextColor(R.id.sw_streak, Color.parseColor(if (streak > 0) "#c2ffc4" else "#93a898"))

      val topWord = data?.optString("topWord", "") ?: ""
      val topLevel = data?.optString("topLevel", "") ?: ""
      if (topWord.isNotEmpty()) {
        views.setTextViewText(R.id.sw_top_word, topWord)
        views.setTextColor(R.id.sw_top_word, levelColor(topLevel))
        views.setViewVisibility(R.id.sw_top_word, android.view.View.VISIBLE)
        views.setTextViewText(R.id.sw_top_title, data?.optString("topTitle", "") ?: "")
      } else {
        views.setViewVisibility(R.id.sw_top_word, android.view.View.GONE)
        views.setTextViewText(R.id.sw_top_title, data?.optString("topLine", "") ?: "Open Settle Watch to start watching.")
      }

      val ago = relative(data?.optJSONObject("time"), data?.optLong("checkedAt", 0L) ?: 0L, System.currentTimeMillis())
      val checkedTpl = data?.optString("checked", "checked {ago}") ?: "checked {ago}"
      views.setTextViewText(R.id.sw_checked, checkedTpl.replace("{ago}", ago))

      // Tapping anywhere opens the app.
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent().setClassName(context, "${context.packageName}.MainActivity")
      launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
      val pending = PendingIntent.getActivity(
        context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      views.setOnClickPendingIntent(R.id.sw_root, pending)
      return views
    }
  }
}
