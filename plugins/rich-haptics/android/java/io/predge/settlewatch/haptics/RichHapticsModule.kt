package io.predge.settlewatch.haptics

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.ReactMethod

/**
 * JS entry point: RichHaptics.play([{ p: "CLICK", scale: 0.7, delay: 0 }, ...]) plays the whole
 * pattern as one vibration. Android 12+ uses composition primitives; unsupported primitives are
 * swapped for the nearest supported one, and if that still fails the pattern becomes an amplitude
 * waveform (Android 8+) or a plain on/off pattern. Errors are swallowed: haptics are decoration.
 */
class RichHapticsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = "RichHaptics"

  private class Step(val name: String, val scale: Float, val delay: Int)

  private val vibrator: Vibrator? by lazy {
    val ctx = reactApplicationContext.applicationContext
    try {
      if (Build.VERSION.SDK_INT >= 31) {
        (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
    } catch (e: Throwable) {
      null
    }
  }

  @ReactMethod
  fun isRich(promise: Promise) {
    try {
      val v = vibrator
      promise.resolve(
        Build.VERSION.SDK_INT >= 31 && v != null && v.hasVibrator() &&
          v.areAllPrimitivesSupported(VibrationEffect.Composition.PRIMITIVE_CLICK, VibrationEffect.Composition.PRIMITIVE_TICK)
      )
    } catch (e: Throwable) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun play(pattern: ReadableArray) {
    try {
      val v = vibrator ?: return
      if (!v.hasVibrator()) return
      val steps = parse(pattern)
      if (steps.isEmpty()) return
      if (Build.VERSION.SDK_INT >= 31 && playComposition(v, steps)) return
      if (Build.VERSION.SDK_INT >= 30 && playPredefined(v, steps)) return
      playWaveform(v, steps)
    } catch (e: Throwable) {
      // ignore
    }
  }

  @ReactMethod
  fun cancel() {
    try {
      main.removeCallbacksAndMessages(null)
      vibrator?.cancel()
    } catch (e: Throwable) {
      // ignore
    }
  }

  private fun parse(pattern: ReadableArray): List<Step> {
    val out = ArrayList<Step>()
    for (i in 0 until minOf(pattern.size(), MAX_STEPS)) {
      if (pattern.getType(i) != ReadableType.Map) continue
      val m = pattern.getMap(i) ?: continue
      val name = if (m.hasKey("p") && m.getType("p") == ReadableType.String) m.getString("p") ?: continue else continue
      val scale = if (m.hasKey("scale") && m.getType("scale") == ReadableType.Number) m.getDouble("scale") else 1.0
      val delay = if (m.hasKey("delay") && m.getType("delay") == ReadableType.Number) m.getDouble("delay") else 0.0
      out.add(Step(name, scale.coerceIn(0.0, 1.0).toFloat(), delay.coerceIn(0.0, 1000.0).toInt()))
    }
    return out
  }

  // ---- Android 12+: composition primitives -------------------------------------------------

  private fun primitiveId(name: String): Int? = when (name) {
    "CLICK" -> VibrationEffect.Composition.PRIMITIVE_CLICK
    "TICK" -> VibrationEffect.Composition.PRIMITIVE_TICK
    "LOW_TICK" -> VibrationEffect.Composition.PRIMITIVE_LOW_TICK
    "THUD" -> VibrationEffect.Composition.PRIMITIVE_THUD
    "SPIN" -> VibrationEffect.Composition.PRIMITIVE_SPIN
    "QUICK_RISE" -> VibrationEffect.Composition.PRIMITIVE_QUICK_RISE
    "SLOW_RISE" -> VibrationEffect.Composition.PRIMITIVE_SLOW_RISE
    "QUICK_FALL" -> VibrationEffect.Composition.PRIMITIVE_QUICK_FALL
    else -> null
  }

  /** Nearest substitutes, tried in order, for actuators that lack a primitive. */
  private fun substitutes(name: String): List<String> = when (name) {
    "LOW_TICK" -> listOf("LOW_TICK", "TICK", "CLICK")
    "TICK" -> listOf("TICK", "CLICK")
    "THUD" -> listOf("THUD", "CLICK")
    "SPIN" -> listOf("SPIN", "QUICK_RISE", "CLICK")
    "SLOW_RISE" -> listOf("SLOW_RISE", "QUICK_RISE", "CLICK")
    "QUICK_RISE" -> listOf("QUICK_RISE", "SLOW_RISE", "CLICK")
    "QUICK_FALL" -> listOf("QUICK_FALL", "CLICK")
    else -> listOf(name)
  }

  @RequiresApi(31)
  private fun playComposition(v: Vibrator, steps: List<Step>): Boolean {
    return try {
      val ids = steps.map { s -> primitiveId(s.name) ?: return false }
      val chosen = if (v.areAllPrimitivesSupported(*ids.toIntArray())) {
        ids
      } else {
        steps.map { s ->
          substitutes(s.name).mapNotNull { primitiveId(it) }.firstOrNull { v.areAllPrimitivesSupported(it) } ?: return false
        }
      }
      val comp = VibrationEffect.startComposition()
      chosen.forEachIndexed { i, id -> comp.addPrimitive(id, steps[i].scale, steps[i].delay) }
      vibrate(v, comp.compose())
      true
    } catch (e: Throwable) {
      false
    }
  }

  // ---- Fallbacks: amplitude waveform (API 26+) or legacy on/off ----------------------------

  /** (duration ms, peak amplitude 0..1, shape) per primitive: 0 flat, 1 rising, -1 falling. */
  private fun shape(name: String): Triple<Int, Float, Int> = when (name) {
    "CLICK" -> Triple(14, 1f, 0)
    "TICK" -> Triple(10, 0.6f, 0)
    "LOW_TICK" -> Triple(12, 0.4f, 0)
    "THUD" -> Triple(40, 1f, -1)
    "SPIN" -> Triple(90, 0.7f, 0)
    "QUICK_RISE" -> Triple(80, 1f, 1)
    "SLOW_RISE" -> Triple(160, 1f, 1)
    "QUICK_FALL" -> Triple(60, 1f, -1)
    else -> Triple(12, 0.8f, 0)
  }

  private val main = Handler(Looper.getMainLooper())

  private fun predefinedId(name: String): Int = when (name) {
    "THUD", "QUICK_FALL" -> VibrationEffect.EFFECT_HEAVY_CLICK
    "CLICK" -> VibrationEffect.EFFECT_CLICK
    "SPIN" -> VibrationEffect.EFFECT_DOUBLE_CLICK
    else -> VibrationEffect.EFFECT_TICK
  }

  /**
   * Many phones (for example several Realme and Oppo models) have no composition primitives but do
   * ship tuned predefined effects. Playing those one after another feels like crisp clicks rather
   * than a buzzing motor, so prefer them over an amplitude waveform.
   */
  @RequiresApi(30)
  private fun playPredefined(v: Vibrator, steps: List<Step>): Boolean {
    val ids = intArrayOf(VibrationEffect.EFFECT_TICK, VibrationEffect.EFFECT_CLICK, VibrationEffect.EFFECT_HEAVY_CLICK)
    val support = v.areAllEffectsSupported(*ids)
    if (support != Vibrator.VIBRATION_EFFECT_SUPPORT_YES) return false
    var at = 0L
    for (s in steps) {
      at += s.delay.toLong()
      if (s.scale < 0.25f) continue
      val effect = VibrationEffect.createPredefined(predefinedId(s.name))
      main.postDelayed({ try { vibrate(v, effect) } catch (e: Throwable) {} }, at)
      at += maxOf(30L, shape(s.name).first.toLong())
    }
    return true
  }

  private fun playWaveform(v: Vibrator, steps: List<Step>) {
    val timings = ArrayList<Long>()
    val amps = ArrayList<Int>()
    for (s in steps) {
      timings.add(s.delay.toLong()); amps.add(0)
      val (ms, peak, dir) = shape(s.name)
      val parts = if (dir == 0) 1 else 4
      for (k in 0 until parts) {
        val f = if (dir == 0) 1f else if (dir > 0) (k + 1f) / parts else (parts - k).toFloat() / parts
        timings.add((ms / parts).toLong().coerceAtLeast(1))
        amps.add((255f * peak * s.scale * f).toInt().coerceIn(1, 255))
      }
    }
    if (Build.VERSION.SDK_INT >= 26) {
      vibrate(v, VibrationEffect.createWaveform(timings.toLongArray(), amps.toIntArray(), -1))
    } else {
      // Legacy: on/off only, so merge each primitive into one pulse of at least 15 ms.
      val legacy = ArrayList<Long>()
      for (s in steps) {
        legacy.add(s.delay.toLong())
        legacy.add(maxOf(15L, shape(s.name).first.toLong()))
      }
      @Suppress("DEPRECATION")
      v.vibrate(legacy.toLongArray(), -1)
    }
  }

  private fun vibrate(v: Vibrator, effect: VibrationEffect) {
    if (Build.VERSION.SDK_INT >= 33) {
      // Touch usage: follows the system "touch feedback" switch.
      v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
    } else if (Build.VERSION.SDK_INT >= 26) {
      v.vibrate(effect)
    }
  }

  companion object {
    private const val MAX_STEPS = 24
  }
}
