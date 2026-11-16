export interface AndroidSourceFile {
  id: string;
  filename: string;
  path: string;
  language: 'kotlin' | 'xml' | 'gradle';
  summary: string;
  code: string;
}

export const ANDROID_ADDIN_FILES: AndroidSourceFile[] = [
  {
    id: 'watcher',
    filename: 'CameraWatcherService.kt',
    path: 'app/src/main/java/com/camera/noteaddin/CameraWatcherService.kt',
    language: 'kotlin',
    summary:
      'Dịch vụ nền lắng nghe MediaStore DCIM/Camera ngay khi Camera gốc chụp xong (IS_PENDING == 0) và bật bảng ghi chú nổi.',
    code: `package com.camera.noteaddin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import androidx.core.app.NotificationCompat

/**
 * Theo dõi thư mục DCIM/Camera của Xiaomi Camera (com.android.camera).
 * Hỗ trợ bật/tắt nhanh chế độ ghi chú ngay từ thanh thông báo hoặc trong ứng dụng.
 */
class CameraWatcherService : Service() {

    companion object {
        const val ACTION_TOGGLE_NOTE_MODE = "com.camera.noteaddin.TOGGLE_NOTE_MODE"
        private const val PREFS_NAME = "camera_note_prefs"
        private const val KEY_ENABLED = "note_mode_enabled"

        fun isEnabled(context: Context): Boolean {
            return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(KEY_ENABLED, true)
        }

        fun setEnabled(context: Context, enabled: Boolean) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ENABLED, enabled)
                .apply()
        }
    }

    private var observer: ContentObserver? = null
    private var lastHandledUri: String? = null
    private var lastHandledAt: Long = 0L

    override fun onCreate() {
        super.onCreate()
        startForeground(101, buildNotification())
        registerCameraObserver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_TOGGLE_NOTE_MODE) {
            val nextState = !isEnabled(this)
            setEnabled(this, nextState)
            val manager = getSystemService(NotificationManager::class.java)
            manager.notify(101, buildNotification())
        }
        return START_STICKY
    }

    private fun buildNotification(): Notification {
        val channelId = "camera_note_watcher"
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Add-in Ghi chú Camera",
                NotificationManager.IMPORTANCE_LOW
            )
            manager.createNotificationChannel(channel)
        }

        val enabled = isEnabled(this)
        val toggleIntent = Intent(this, CameraWatcherService::class.java).apply {
            action = ACTION_TOGGLE_NOTE_MODE
        }
        val togglePending = PendingIntent.getService(
            this,
            0,
            toggleIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle(
                if (enabled) "Ghi chú Camera đang BẬT" else "Ghi chú Camera đang TẮT"
            )
            .setContentText(
                if (enabled) "Tự động hiện ghi chú khi chụp ảnh mới"
                else "Chụp ảnh bình thường, không hiện bảng ghi chú"
            )
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .addAction(
                0,
                if (enabled) "Tắt ghi chú" else "Bật ghi chú",
                togglePending
            )
            .setOngoing(true)
            .build()
    }

    private fun registerCameraObserver() {
        val handler = Handler(Looper.getMainLooper())
        observer = object : ContentObserver(handler) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                super.onChange(selfChange, uri)
                if (uri != null && isEnabled(this@CameraWatcherService)) {
                    inspectNewMedia(uri)
                }
            }
        }

        contentResolver.registerContentObserver(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            true,
            observer!!
        )
    }

    private fun inspectNewMedia(uri: Uri) {
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.RELATIVE_PATH,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.IS_PENDING,
            MediaStore.Images.Media.DISPLAY_NAME
        )

        contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
            if (!cursor.moveToFirst()) return

            val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID))
            val relPath = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.RELATIVE_PATH)) ?: ""
            val isPending = cursor.getInt(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.IS_PENDING))
            val displayName = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)) ?: ""

            // Quan trọng trên Xiaomi HyperOS/MIUI: bỏ qua file nháp pending & file đã đóng dấu
            if (isPending == 1) return
            if (!relPath.contains("DCIM/Camera", ignoreCase = true)) return
            if (displayName.startsWith("NOTE_")) return

            val contentUri = ContentUris.withAppendedId(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                id
            ).toString()

            val now = System.currentTimeMillis()
            if (contentUri == lastHandledUri && (now - lastHandledAt) < 3500L) {
                return
            }

            lastHandledUri = contentUri
            lastHandledAt = now

            // Hiển thị bảng ghi chú nổi ngay trên Camera gốc
            PostCaptureOverlayManager(this).showOverlayForPhoto(Uri.parse(contentUri))
        }
    }

    override fun onDestroy() {
        observer?.let { contentResolver.unregisterContentObserver(it) }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}`,
  },
  {
    id: 'overlay',
    filename: 'PostCaptureOverlayManager.kt',
    path: 'app/src/main/java/com/camera/noteaddin/PostCaptureOverlayManager.kt',
    language: 'kotlin',
    summary:
      'Hiển thị cửa sổ nổi dạng Bottom Sheet ngay đè lên giao diện Camera Xiaomi, tự điền vị trí GPS và thời gian thực để người dùng gõ ghi chú nhanh.',
    code: `package com.camera.noteaddin

import android.content.Context
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Tạo bảng nhập ghi chú nổi (Floating Overlay) ngay sau khi chụp ảnh.
 * Cho phép mở bàn phím gõ trực tiếp mà không thoát khỏi ứng dụng Camera gốc.
 */
class PostCaptureOverlayManager(private val context: Context) {

    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var overlayView: View? = null

    fun showOverlayForPhoto(photoUri: Uri) {
        if (!Settings.canDrawOverlays(context)) {
            Toast.makeText(
                context,
                "Vui lòng cấp quyền Hiển thị trên ứng dụng khác cho Add-in",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        if (overlayView != null) dismiss()

        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            // Không chặn nút Back, nhưng cho phép EditText nhận bàn phím
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        }

        val view = LayoutInflater.from(context).inflate(R.layout.overlay_quick_note, null)
        overlayView = view

        val thumbPreview = view.findViewById<ImageView>(R.id.imgPreview)
        val txtMeta = view.findViewById<TextView>(R.id.txtAutoMeta)
        val edtNote = view.findViewById<EditText>(R.id.edtNote)
        val btnSave = view.findViewById<Button>(R.id.btnSaveStamp)
        val btnDismiss = view.findViewById<Button>(R.id.btnDismiss)

        thumbPreview.setImageURI(photoUri)
        txtMeta.text = "Đang đọc EXIF & tọa độ GPS..."

        val engine = PhotoStampEngine(context)
        var resolvedMeta: PhotoMeta? = null

        CoroutineScope(Dispatchers.Main).launch {
            resolvedMeta = withContext(Dispatchers.IO) {
                engine.extractLocationAndTime(photoUri)
            }
            resolvedMeta?.let { meta ->
                txtMeta.text = "\${meta.timestamp} · \${meta.address}"
            }
        }

        btnDismiss.setOnClickListener { dismiss() }

        btnSave.setOnClickListener {
            val noteText = edtNote.text.toString().trim()
            val meta = resolvedMeta ?: engine.fallbackMeta()
            btnSave.isEnabled = false
            btnSave.text = "Đang lưu..."

            CoroutineScope(Dispatchers.Main).launch {
                val saved = withContext(Dispatchers.IO) {
                    engine.stampAndSavePhoto(photoUri, noteText, meta)
                }
                Toast.makeText(
                    context,
                    if (saved != null) "Đã lưu ảnh kèm ghi chú & vị trí" else "Lỗi lưu ảnh",
                    Toast.LENGTH_SHORT
                ).show()
                dismiss()
            }
        }

        windowManager.addView(view, params)
    }

    fun dismiss() {
        overlayView?.let {
            runCatching { windowManager.removeView(it) }
            overlayView = null
        }
    }
}`,
  },
  {
    id: 'stamper',
    filename: 'PhotoStampEngine.kt',
    path: 'app/src/main/java/com/camera/noteaddin/PhotoStampEngine.kt',
    language: 'kotlin',
    summary:
      'Đọc EXIF GPS & thời gian chụp từ ảnh Camera gốc, gọi FusedLocationProvider nếu ảnh chưa có GPS, dịch địa chỉ qua Geocoder và vẽ nhãn trực tiếp lên Bitmap.',
    code: `package com.camera.noteaddin

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.location.Geocoder
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Tasks
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class PhotoMeta(
    val timestamp: String,
    val address: String,
    val coordinates: String
)

class PhotoStampEngine(private val context: Context) {

    @SuppressLint("MissingPermission")
    fun extractLocationAndTime(photoUri: Uri): PhotoMeta {
        var lat: Double? = null
        var lon: Double? = null
        var timestamp = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault()).format(Date())

        context.contentResolver.openInputStream(photoUri)?.use { input ->
            val exif = ExifInterface(input)
            exif.latLong?.let { latLong ->
                lat = latLong[0]
                lon = latLong[1]
            }
            exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)?.let { raw ->
                timestamp = formatExifDate(raw) ?: timestamp
            }
        }

        // Nếu Camera gốc chưa kịp gắn GPS vào EXIF, lấy trực tiếp từ FusedLocation
        if (lat == null || lon == null) {
            runCatching {
                val client = LocationServices.getFusedLocationProviderClient(context)
                val loc = Tasks.await(client.lastLocation)
                if (loc != null) {
                    lat = loc.latitude
                    lon = loc.longitude
                }
            }
        }

        val coordText = if (lat != null && lon != null) {
            String.format(Locale.US, "%.5f° N, %.5f° E", lat, lon)
        } else {
            "Chưa có tín hiệu GPS"
        }

        val addressText = if (lat != null && lon != null) {
            resolveAddress(lat!!, lon!!) ?: coordText
        } else {
            "Không xác định vị trí"
        }

        return PhotoMeta(timestamp, addressText, coordText)
    }

    fun fallbackMeta(): PhotoMeta {
        val now = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault()).format(Date())
        return PhotoMeta(now, "Vị trí thủ công", "--")
    }

    private fun resolveAddress(lat: Double, lon: Double): String? {
        return runCatching {
            val geocoder = Geocoder(context, Locale("vi", "VN"))
            @Suppress("DEPRECATION")
            val list = geocoder.getFromLocation(lat, lon, 1)
            val addr = list?.firstOrNull() ?: return null
            listOfNotNull(addr.thoroughfare, addr.subLocality, addr.subAdminArea, addr.adminArea)
                .distinct()
                .take(3)
                .joinToString(", ")
        }.getOrNull()
    }

    fun stampAndSavePhoto(photoUri: Uri, note: String, meta: PhotoMeta): Uri? {
        val original = context.contentResolver.openInputStream(photoUri)?.use {
            BitmapFactory.decodeStream(it)
        } ?: return null

        val outBitmap = original.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(outBitmap)

        val unit = original.width * 0.022f
        val pad = unit * 1.4f

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = unit * 1.1f
            isFakeBoldText = true
            setShadowLayer(unit * 0.35f, 0f, unit * 0.08f, Color.argb(210, 0, 0, 0))
        }
        val metaPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#FDBA74")
            textSize = unit * 0.85f
            setShadowLayer(unit * 0.35f, 0f, unit * 0.08f, Color.argb(210, 0, 0, 0))
        }

        val bottomY = original.height - pad
        canvas.drawText("\${meta.timestamp}  ·  \${meta.address}", pad, bottomY, metaPaint)
        if (note.isNotEmpty()) {
            canvas.drawText(note, pad, bottomY - unit * 1.45f, titlePaint)
        }

        val filename = "NOTE_\${System.currentTimeMillis()}.jpg"
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, filename)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/CameraNotes")
        }

        val destUri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            ?: return null

        context.contentResolver.openOutputStream(destUri)?.use { out ->
            outBitmap.compress(Bitmap.CompressFormat.JPEG, 94, out)
        }

        // Ghi chú vào EXIF UserComment để tìm kiếm lại trong Thư viện
        context.contentResolver.openFileDescriptor(destUri, "rw")?.use { pfd ->
            val exif = ExifInterface(pfd.fileDescriptor)
            exif.setAttribute(ExifInterface.TAG_USER_COMMENT, note)
            exif.saveAttributes()
        }

        original.recycle()
        outBitmap.recycle()
        return destUri
    }

    private fun formatExifDate(raw: String): String? {
        return runCatching {
            val parser = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US)
            val date = parser.parse(raw) ?: return null
            SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault()).format(date)
        }.getOrNull()
    }
}`,
  },
  {
    id: 'xiaomi_helper',
    filename: 'XiaomiPermissionHelper.kt',
    path: 'app/src/main/java/com/camera/noteaddin/XiaomiPermissionHelper.kt',
    language: 'kotlin',
    summary:
      'Mở thẳng màn hình cài đặt quyền ẩn của MIUI 14 / HyperOS (Hiển thị cửa sổ pop-up khi chạy ngầm & Tự khởi chạy).',
    code: `package com.camera.noteaddin

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings

/**
 * MIUI 14 / HyperOS chặn dịch vụ nền và cửa sổ pop-up
 * nếu không bật 2 quyền đặc thù của Xiaomi.
 */
object XiaomiPermissionHelper {

    fun openMiuiOtherPermissions(context: Context) {
        val intent = Intent("miui.intent.action.APP_PERM_EDITOR").apply {
            setClassName(
                "com.miui.securitycenter",
                "com.miui.permcenter.permissions.PermissionsEditorActivity"
            )
            putExtra("extra_pkgname", context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        runCatching {
            context.startActivity(intent)
        }.onFailure {
            val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(fallback)
        }
    }

    fun openMiuiAutostart(context: Context) {
        val intent = Intent().apply {
            component = ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
            )
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { context.startActivity(intent) }
    }
}`,
  },
  {
    id: 'manifest',
    filename: 'AndroidManifest.xml',
    path: 'app/src/main/AndroidManifest.xml',
    language: 'xml',
    summary:
      'Khai báo quyền Android 13/14 (READ_MEDIA_IMAGES, SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE_DATA_SYNC) và Intent Chia sẻ (ACTION_SEND) dự phòng.',
    code: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Đọc ảnh vừa chụp từ DCIM/Camera trên Android 13/14 -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.ACCESS_MEDIA_LOCATION" />

    <!-- Vị trí GPS tự động -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <!-- Hiển thị bảng ghi chú đè lên Camera gốc -->
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />

    <!-- Dịch vụ chạy ngầm lắng nghe nút chụp -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application
        android:allowBackup="true"
        android:label="Ghi chú Camera"
        android:theme="@style/Theme.Material3.DayNight.NoActionBar">

        <service
            android:name=".CameraWatcherService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="dataSync" />

        <!-- Cho phép gọi Add-in trực tiếp từ nút Chia sẻ của Thư viện / Camera Xiaomi -->
        <activity
            android:name=".QuickNoteActivity"
            android:exported="true"
            android:theme="@style/Theme.Material3.DayNight.Dialog">
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
        </activity>
    </application>

</manifest>`,
  },
];
