import React, { useState, useCallback, useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const STAGE_LABELS = {
  queued: 'Queued for processing...',
  converting_glb: 'Converting geometry to GLB...',
  extracting_metadata: 'Extracting metadata...',
  extracting_hierarchy: 'Building spatial hierarchy...',
  finalizing: 'Finalizing outputs...',
  completed: 'Finalizing outputs...'
}

const STAGE_ORDER = [
  'queued',
  'converting_glb',
  'extracting_metadata',
  'extracting_hierarchy',
  'finalizing'
]

const STAGE_HINTS = {
  queued: 'Waiting for a worker to start...',
  converting_glb: 'Generating viewable geometry from the IFC file.',
  extracting_metadata: 'Reading BIM properties and attributes.',
  extracting_hierarchy: 'Building the navigation tree.',
  finalizing: 'Writing output files to disk.'
}

const normalizeStage = (stage, status) => {
  if (stage) return stage
  if (status === 'pending') return 'queued'
  return null
}

const getStageLabel = (stage, status) => {
  if (stage && STAGE_LABELS[stage]) return STAGE_LABELS[stage]
  return `Processing... (${status})`
}

// Frame animation configuration
const FRAME_COUNT = 191
const FRAME_PATH = '/media/frames_max2/ezgif-frame-'

// Story beats configuration - Updated for new scroll pattern
const STORY_BEATS = [
  {
    id: 'title',
    trigger: 0,
    end: 0.25,
    title: 'Building Insights',
    desc: 'Digital Twin BIM Viewer',
    position: 'center'
  },
  {
    id: 'viz',
    trigger: 0.30,
    end: 0.55,
    title: '3D Visualization',
    desc: 'Explore your model from every angle',
    position: 'left'
  },
  {
    id: 'meta',
    trigger: 0.60,
    end: 0.85,
    title: 'Metadata + Hierarchy',
    desc: 'Navigate BIM properties intuitively',
    position: 'right'
  },

]

// Feature cards data - Clean minimal design
const FEATURES = [
  {
    title: '3D Visualization',
    desc: 'Explore your model in real-time 3D with intuitive navigation controls'
  },
  {
    title: 'Metadata Extraction',
    desc: 'Access all BIM properties and attributes instantly from any element'
  },
  {
    title: 'Spatial Hierarchy',
    desc: 'Navigate building structure intuitively through the element tree'
  },
  {
    title: 'Carbon Analysis',
    desc: 'Understand embodied carbon impact with detailed material breakdowns'
  },
]

/**
 * UploadPanel Component - Arctic Zen Minimalist Design with Canvas Scrollytelling
 * 
 * Features:
 * - Canvas-based frame rendering for smooth animation
 * - 400vh sticky scroll container
 * - Text overlays at 0%, 30%, 60%, 90% scroll positions
 */
function UploadPanel({ onModelReady, hasModel, onReset }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadState, setUploadState] = useState('idle')
  const [progress, setProgress] = useState('')
  const [jobStage, setJobStage] = useState(null)
  const [error, setError] = useState(null)
  
  // FM Sidecar state
  const [fmSidecarFile, setFmSidecarFile] = useState(null)

  // Scroll animation states
  const [imagesLoaded, setImagesLoaded] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  
  // Refs for performance optimizations (removing state from scroll loop)
  const currentFrameRef = useRef(0)
  const pendingFrameRef = useRef(0)
  const rafRef = useRef(null)
  const containerRef = useRef(null)
  const heroRef = useRef(null)
  const canvasRef = useRef(null)
  const framesRef = useRef([])
  const contextRef = useRef(null)
  const storyBeatRefs = useRef([])
  const uploadCardRef = useRef(null)
  const scrollBarRef = useRef(null)
  const featureSectionRef = useRef(null)
  const featureHeaderRef = useRef(null)
  const featureCardRefs = useRef([])

  const API_URL = 'http://localhost:8000'
  const HEALTH_TIMEOUT_MS = 5000
  const UPLOAD_TIMEOUT_MS = 180000

  const fetchWithTimeout = useCallback(async (url, options = {}, timeoutMs = 30000) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { credentials: 'include', ...options, signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
  }, [])

  const checkBackendHealth = useCallback(async () => {
    const response = await fetchWithTimeout(`${API_URL}/health`, {}, HEALTH_TIMEOUT_MS)
    if (!response.ok) {
      throw new Error(`Backend health check failed (${response.status})`)
    }
  }, [API_URL, fetchWithTimeout])

  // Generate frame path
  const getFramePath = (index) => {
    const num = String(index + 1).padStart(3, '0')
    return `${FRAME_PATH}${num}.png`
  }

  // Check for reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)

    const handler = (e) => setPrefersReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Enable/disable body scrolling based on landing page visibility
  useEffect(() => {
    if (hasModel) {
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      const root = document.getElementById('root')
      if (root) root.style.overflow = 'hidden'
    } else {
      document.documentElement.style.overflow = 'auto'
      document.documentElement.style.height = 'auto'
      document.body.style.overflow = 'auto'
      document.body.style.height = 'auto'
      const root = document.getElementById('root')
      if (root) {
        root.style.overflow = 'auto'
        root.style.height = 'auto'
      }
    }

    return () => {
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      const root = document.getElementById('root')
      if (root) root.style.overflow = 'hidden'
    }
  }, [hasModel])

  // Always start at top when opening the upload panel
  useEffect(() => {
    if (hasModel) return
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    ScrollTrigger.refresh()
  }, [hasModel])

  // Preload all frames
  useEffect(() => {
    if (hasModel) return

    const images = new Array(FRAME_COUNT)
    let loadedCount = 0
    framesRef.current = images

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image()
      img.src = getFramePath(i)
      img.onload = async () => {
        let frame = img

        if (typeof createImageBitmap === 'function') {
          try {
            frame = await createImageBitmap(img)
          } catch {
            try {
              await img.decode()
            } catch {}
            frame = img
          }
        } else {
          try {
            await img.decode()
          } catch {}
        }

        images[i] = frame
        loadedCount++
        if (loadedCount === FRAME_COUNT) {
          setImagesLoaded(true)
        }
      }
      img.onerror = () => {
        loadedCount++
        if (loadedCount === FRAME_COUNT) {
          setImagesLoaded(true)
        }
      }
    }
  }, [hasModel])

  // Initialize canvas and set up context
  useEffect(() => {
    if (!canvasRef.current || !imagesLoaded) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    contextRef.current = ctx

    // Set canvas size to match container
    const resizeCanvas = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1

      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      ctx.scale(dpr, dpr)

      // Draw current frame after resize
      drawFrame(currentFrameRef.current)
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Draw initial frame
    drawFrame(0)

    return () => window.removeEventListener('resize', resizeCanvas)
  }, [imagesLoaded])

  // Draw frame to canvas
  const drawFrame = (frameIndex) => {
    const ctx = contextRef.current
    const canvas = canvasRef.current
    const frame = framesRef.current[frameIndex]

    if (!ctx || !canvas || !frame) return

    const frameWidth = frame.width || frame.naturalWidth
    const frameHeight = frame.height || frame.naturalHeight
    if (!frameWidth || !frameHeight) return

    const canvasWidth = canvas.width / (window.devicePixelRatio || 1)
    const canvasHeight = canvas.height / (window.devicePixelRatio || 1)

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    // Calculate aspect ratio fit (contain)
    const imgAspect = frameWidth / frameHeight
    const canvasAspect = canvasWidth / canvasHeight

    let drawWidth, drawHeight, offsetX, offsetY

    if (imgAspect > canvasAspect) {
      // Image is wider - fit to width
      drawWidth = canvasWidth
      drawHeight = canvasWidth / imgAspect
      offsetX = 0
      offsetY = (canvasHeight - drawHeight) / 2
    } else {
      // Image is taller - fit to height
      drawHeight = canvasHeight
      drawWidth = canvasHeight * imgAspect
      offsetX = (canvasWidth - drawWidth) / 2
      offsetY = 0
    }

    // Draw with smooth interpolation
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(frame, offsetX, offsetY, drawWidth, drawHeight)
  }

  const requestDrawFrame = (nextFrame) => {
    pendingFrameRef.current = nextFrame

    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null

      const frameIndex = pendingFrameRef.current
      if (currentFrameRef.current !== frameIndex) {
        currentFrameRef.current = frameIndex
        drawFrame(frameIndex)
      }
    })
  }

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  // GSAP ScrollTrigger for canvas frame animation with pinning
  useEffect(() => {
    if (!imagesLoaded || prefersReducedMotion || hasModel || !heroRef.current) return

    // Helper to calculate opacity based on progress (internal to avoid render loop)
    const getOpacity = (beat, p) => {
      if (p < beat.trigger - 0.05) return 0
      if (p > beat.end + 0.05) return 0
      if (p >= beat.trigger - 0.05 && p < beat.trigger + 0.05) {
        return (p - (beat.trigger - 0.05)) / 0.1
      }
      if (p > beat.end - 0.05) {
        return Math.max(0, 1 - ((p - (beat.end - 0.05)) / 0.1))
      }
      return 1
    }

    const ctx = gsap.context(() => {
      const frameObj = { frame: 0 }

      // Pin the hero section and scrub through all frames
      // The hero stays pinned for multiple viewports of scroll, then unpins to reveal content below
      gsap.to(frameObj, {
        frame: FRAME_COUNT - 1,
        ease: 'none',
        scrollTrigger: {
          trigger: heroRef.current,
          start: 'top top',
          end: '+=300%', // Multiple screens of scroll for smoother pacing
          pin: true, // Pin the hero element
          pinSpacing: 'margin', // Use margin to avoid border-box padding issues
          scrub: 1.5, // Higher value = smoother momentum/deceleration when scrolling stops
          anticipatePin: 1, // Prevent jank when pinning
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const p = self.progress

            // Update Scroll Bar
            if (scrollBarRef.current) {
              scrollBarRef.current.style.width = `${p * 100}%`
            }

            // Draw Frame
            const frameIndex = Math.round(frameObj.frame)
            requestDrawFrame(frameIndex)

            // Update Story Beats
            STORY_BEATS.forEach((beat, i) => {
              const el = storyBeatRefs.current[i]
              if (el) {
                const opacity = getOpacity(beat, p)
                el.style.opacity = opacity
                el.style.pointerEvents = opacity > 0 ? 'auto' : 'none'
              }
            })

            // Update Upload Card
            if (uploadCardRef.current) {
              const shouldShow = p > 0.75
              uploadCardRef.current.style.opacity = shouldShow ? 1 : 0
              uploadCardRef.current.style.transform = shouldShow 
                ? 'translate(-50%, -50%) scale(1)' 
                : 'translate(-50%, -40%) scale(0.95)'
              uploadCardRef.current.style.pointerEvents = shouldShow ? 'auto' : 'none'
            }
          }
        },
      })

    }, containerRef)

    return () => ctx.revert()
  }, [imagesLoaded, prefersReducedMotion, hasModel])

  // Refresh ScrollTrigger after frames are ready to ensure correct layout
  useEffect(() => {
    if (!imagesLoaded || prefersReducedMotion || hasModel) return
    ScrollTrigger.refresh()
  }, [imagesLoaded, prefersReducedMotion, hasModel])

  // Minimal scroll reveal for feature section
  useEffect(() => {
    if (prefersReducedMotion || hasModel || !featureSectionRef.current) return

    const ctx = gsap.context(() => {
      const headerEl = featureHeaderRef.current
      const cards = featureCardRefs.current.filter(Boolean)

      if (!headerEl && cards.length === 0) return

      if (headerEl) {
        gsap.set(headerEl, { opacity: 0, y: 22, filter: 'blur(6px)' })
      }
      if (cards.length > 0) {
        gsap.set(cards, { opacity: 0, y: 26, scale: 0.98, filter: 'blur(6px)' })
      }

      const timeline = gsap.timeline({ paused: true })

      if (headerEl) {
        timeline.to(headerEl, {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.7,
          ease: 'power3.out',
        })
      }

      if (cards.length > 0) {
        timeline.to(
          cards,
          {
            opacity: 1,
            y: 0,
            scale: 1,
            filter: 'blur(0px)',
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.08,
          },
          '-=0.35'
        )
      }

      ScrollTrigger.create({
        trigger: featureSectionRef.current,
        start: 'top 85%',
        end: 'bottom 20%',
        onEnter: () => timeline.play(0),
        onEnterBack: () => timeline.play(0),
        onLeaveBack: () => timeline.reverse(),
        invalidateOnRefresh: true,
      })
    }, featureSectionRef)

    return () => ctx.revert()
  }, [prefersReducedMotion, hasModel])

  // Calculate story beat visibility based on scroll progress (Legacy / Fallback usage if needed)
  const getStoryBeatOpacity = (beat, progress = 0) => {
    // Kept for prop calculation if needed, but animation is now handled via refs
    if (progress < beat.trigger - 0.05) return 0
    if (progress > beat.end + 0.05) return 0

    // Fade in
    if (progress < beat.trigger + 0.05) {
      return Math.min(1, (progress - (beat.trigger - 0.05)) / 0.1)
    }
    // Fade out
    if (progress > beat.end - 0.05) {
      return Math.max(0, 1 - (progress - (beat.end - 0.05)) / 0.1)
    }
    return 1
  }

  // Get story beat position styles
  const getStoryBeatPosition = (position) => {
    switch (position) {
      case 'left':
        return {
          left: isMobile ? '20px' : '10%',
          top: '50%',
          transform: 'translateY(-50%)',
          textAlign: 'left'
        }
      case 'right':
        return {
          right: isMobile ? '20px' : '10%',
          top: '50%',
          transform: 'translateY(-50%)',
          textAlign: 'right'
        }
      case 'center':
      default:
        return {
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center'
        }
    }
  }

  /**
   * Poll job status until complete
   */
  const pollJobStatus = useCallback(async (jobId) => {
    const maxDurationMs = 30 * 60 * 1000
    const startTime = Date.now()

    while (Date.now() - startTime < maxDurationMs) {
      try {
        const response = await fetch(`${API_URL}/job/${jobId}`, { credentials: 'include' })
        const job = await response.json()

        if (job.status === 'completed') {
          setUploadState('idle')
          onModelReady?.({
            glbUrl: job.glb_url ? `${API_URL}${job.glb_url}` : null,
            metadataUrl: `${API_URL}${job.metadata_url}`,
            hierarchyUrl: `${API_URL}${job.hierarchy_url}`,
            jobId: jobId,
            filename: job.ifc_filename,
            ifcSchema: job.ifc_schema
          })
          return
        } else if (job.status === 'failed') {
          throw new Error(job.error || 'Processing failed')
        } else {
          const normalizedStage = normalizeStage(job.stage, job.status)
          setJobStage(normalizedStage)
          setProgress(getStageLabel(normalizedStage, job.status))
        }
      } catch (err) {
        throw err
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error('Processing timeout after 30 minutes')
  }, [API_URL, onModelReady])

  /**
   * Upload file to backend
   */
  const uploadFile = useCallback(async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.ifc')) {
      setError('Please upload an IFC file')
      return
    }

    setUploadState('uploading')
    setError(null)
    setProgress('Uploading...')
    setJobStage(null)

    try {
      await checkBackendHealth()

      const formData = new FormData()
      formData.append('file', file)
      
      // Include FM sidecar if provided
      if (fmSidecarFile) {
        formData.append('fm_params', fmSidecarFile)
        setProgress('Uploading IFC + FM parameters...')
      }

      const response = await fetchWithTimeout(`${API_URL}/upload`, {
        method: 'POST',
        body: formData
      }, UPLOAD_TIMEOUT_MS)

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'Upload failed')
      }

      const job = await response.json()
      setUploadState('processing')
      const fmNote = job.fm_params_filename ? ' (with FM parameters)' : ''
      setProgress(`Processing ${file.name}${fmNote}...`)
      setJobStage('queued')

      await pollJobStatus(job.job_id)

    } catch (err) {
      console.error('Upload error:', err)
      let msg = err.message || 'Upload failed'
      if (err.name === 'AbortError') {
        msg = 'Upload timed out. Backend may be unavailable or still busy.'
      }
      if (msg.includes('NetworkError') || msg.includes('Failed to fetch')) {
        msg += '. Is the backend server running?'
      }
      setError(msg)
      setUploadState('error')
      setJobStage(null)
    }
  }, [API_URL, pollJobStatus, fmSidecarFile, checkBackendHealth, fetchWithTimeout])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleReset = () => {
    setUploadState('idle')
    setError(null)
    setProgress('')
    setJobStage(null)
    setFmSidecarFile(null)  // Clear FM sidecar
    if (onReset) onReset()
  }
  
  // Handle FM sidecar file selection
  const handleFmSidecarChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.name.endsWith('.json')) {
        setFmSidecarFile(file)
      } else {
        setError('FM sidecar must be a .json file')
      }
    }
  }, [])
  
  const clearFmSidecar = useCallback(() => {
    setFmSidecarFile(null)
  }, [])

  // If model is loaded, show minimal floating button
  if (hasModel) {
    return (
      <div style={styles.miniPanel}>
        <button style={styles.newModelBtn} onClick={handleReset}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Load New Model
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={styles.scrollContainer}>
      {/* Loading overlay */}
      {!imagesLoaded && !prefersReducedMotion && (
        <div style={styles.loadingOverlay}>
          <div style={styles.loadingContent}>
            <div style={styles.loadingSpinner}></div>
            <p style={styles.loadingText}>Loading</p>
          </div>
        </div>
      )}

      {/* Hero Section - Gets pinned during frame animation */}
      <div ref={heroRef} style={styles.heroSection}>
        {/* Navigation Header */}
        <header style={styles.navbar}>
          <div style={styles.navContent}>
            <div style={styles.logo}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
                <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                <line x1="12" y1="22" x2="12" y2="15.5" />
                <polyline points="22 8.5 12 15.5 2 8.5" />
              </svg>
              <span style={styles.logoText}>Digital Twin</span>
            </div>
          </div>

          {/* Scroll Progress Bar */}
          <div style={styles.scrollBar}>
            <div 
              ref={scrollBarRef}
              style={{
              ...styles.scrollBarFill,
              width: '0%'
            }}></div>
          </div>
        </header>

        <div style={styles.canvasWrapper}>
          <canvas
            ref={canvasRef}
            style={styles.canvas}
            role="img"
            aria-label="3D Building Construction Animation"
          />

          {/* Gradient Overlay for text readability */}
          <div style={styles.canvasOverlay}></div>

          {/* Story Beat Text Overlays */}
          {STORY_BEATS.map((beat, index) => {
            const positionStyles = getStoryBeatPosition(beat.position)

            return (
              <div
                key={beat.id}
                ref={el => storyBeatRefs.current[index] = el}
                style={{
                  ...styles.storyBeat,
                  ...positionStyles,
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              >
                <h2 style={styles.storyBeatTitle}>{beat.title}</h2>
                <p style={styles.storyBeatDesc}>{beat.desc}</p>
              </div>
            )
          })}

          {/* Upload Card - Centered and visible earlier */}
          <div
            ref={uploadCardRef}
            style={{
              ...styles.uploadCard,
              opacity: 0,
              transform: 'translate(-50%, -40%) scale(0.95)',
              transition: prefersReducedMotion ? 'none' : 'opacity 0.5s ease, transform 0.5s ease',
              pointerEvents: 'none',
            }}
          >
            {uploadState === 'idle' && (
              <>
                <div
                  style={{
                    ...styles.dropzone,
                    ...(isDragging ? styles.dropzoneActive : {})
                  }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" style={styles.dropIcon}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p style={styles.dropText}>
                    Drop <strong>.ifc</strong> or
                  </p>
                  <label style={styles.browseBtn}>
                    Browse
                    <input
                      type="file"
                      accept=".ifc"
                      onChange={handleFileChange}
                      style={styles.fileInput}
                    />
                  </label>
                </div>
                
                {/* Optional FM Sidecar File */}
                <div style={styles.fmSidecarSection}>
                  {fmSidecarFile ? (
                    <div style={styles.fmSidecarSelected}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <span style={styles.fmSidecarName}>{fmSidecarFile.name}</span>
                      <button style={styles.fmSidecarClear} onClick={clearFmSidecar}>×</button>
                    </div>
                  ) : (
                    <label style={styles.fmSidecarLabel}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Add FM Parameters (optional)
                      <input
                        type="file"
                        accept=".json,.fm_params.json"
                        onChange={handleFmSidecarChange}
                        style={styles.fileInput}
                      />
                    </label>
                  )}
                </div>
              </>
            )}

            {uploadState === 'uploading' && (
              <div style={styles.processing}>
                <div style={styles.spinner}></div>
                <p style={styles.progressText}>Uploading...</p>
              </div>
            )}

            {uploadState === 'processing' && (
              <div style={styles.processing}>
                <div style={styles.stageList}>
                  {STAGE_ORDER.map((stageKey, index) => {
                    const currentKey = normalizeStage(jobStage) || 'queued'
                    let currentIndex = STAGE_ORDER.indexOf(currentKey)
                    if (currentKey === 'completed' || (currentIndex === -1 && currentKey !== 'queued')) {
                      currentIndex = STAGE_ORDER.length
                    }
                    const thisIndex = index
                    let status = 'pending'
                    if (thisIndex < currentIndex) status = 'completed'
                    if (thisIndex === currentIndex) status = 'active'
                    const isCompleted = status === 'completed'
                    const isActive = status === 'active'
                    const isLast = index === STAGE_ORDER.length - 1

                    return (
                      <div key={stageKey} style={styles.stageItem}>
                        <div style={styles.stageIconCol}>
                          <div style={{
                            ...styles.stageDot,
                            background: isCompleted || isActive ? '#111827' : '#E5E7EB',
                            transform: isActive ? 'scale(1.2)' : 'scale(1)',
                          }} />
                          {!isLast && (
                            <div style={{
                              ...styles.stageLine,
                              background: isCompleted ? '#111827' : '#E5E7EB',
                            }} />
                          )}
                        </div>
                        <div style={styles.stageContent}>
                          <div style={{
                            ...styles.stageLabel,
                            color: isCompleted || isActive ? '#1F2937' : '#9CA3AF',
                          }}>
                            {STAGE_LABELS[stageKey]}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {uploadState === 'error' && (
              <div style={styles.errorBox}>
                <p style={styles.errorText}>{error}</p>
                <button style={styles.retryBtn} onClick={handleReset}>Try Again</button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Feature Cards Section - After hero */}
      <section id="features" style={styles.featureSection} ref={featureSectionRef}>
        <div style={styles.featureSectionHeader} ref={featureHeaderRef}>
          <h2 style={styles.featureSectionTitle}>Everything you need</h2>
          <p style={styles.featureSectionDesc}>Powerful tools for BIM analysis</p>
        </div>
        <div style={{
          ...styles.featureGrid,
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
        }}>
          {FEATURES.map((feature, index) => (
            <div
              key={index}
              ref={(el) => {
                featureCardRefs.current[index] = el
              }}
              style={styles.featureCard}
            >
              <h3 style={styles.featureTitle}>{feature.title}</h3>
              <p style={styles.featureDesc}>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * Arctic Zen Minimalist Styles
 */
const softShadow = 'rgb(255, 255, 255) 1px 1px 1px 0px inset, rgba(0, 0, 0, 0.15) -1px -1px 1px 0px inset, rgba(0, 0, 0, 0.26) 0.444584px 0.444584px 0.628737px -1px, rgba(0, 0, 0, 0.22) 1.21324px 1.21324px 1.38357px -2px, rgba(0, 0, 0, 0.15) 2.60599px 2.60599px 2.68477px -3px, rgba(0, 0, 0, 0.04) 6px 6px 6px -4px';

const styles = {
  // Scroll Container - Simple wrapper, GSAP's pinSpacing handles the height
  scrollContainer: {
    position: 'relative',
    background: '#e8e8ec',
    fontFamily: 'inherit',
  },

  // Hero Section - Full viewport, gets pinned by GSAP
  heroSection: {
    position: 'relative',
    height: '100vh',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#e8e8ec',
  },

  // Loading overlay
  loadingOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#e8e8ec',
    zIndex: 9999,
  },
  loadingContent: {
    textAlign: 'center',
  },
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '3px solid #F3F4F6',
    borderTopColor: '#111827',
    borderRadius: '50%',
    margin: '0 auto 16px',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    margin: '0 0 4px 0',
    color: '#111827',
    fontSize: '16px',
    fontWeight: 500,
  },

  // Navbar
  navbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    background: 'rgba(244, 244, 244, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    zIndex: 100,
  },
  navContent: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '0 32px',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoText: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#111827',
    letterSpacing: '-0.01em',
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navLink: {
    fontSize: '14px',
    color: '#6B7280',
    textDecoration: 'none',
    fontWeight: 400,
    padding: '8px 12px',
    borderRadius: '6px',
  },
  navDot: {
    color: '#D1D5DB',
    fontSize: '14px',
  },
  scrollBar: {
    height: '2px',
    background: 'rgba(0,0,0,0.05)',
    position: 'relative',
  },
  scrollBarFill: {
    height: '100%',
    background: '#3B82F6',
    transition: 'width 0.1s ease-out',
  },

  // Canvas Wrapper
  canvasWrapper: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  canvasOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at center, transparent 30%, rgba(232, 232, 236, 0.6) 100%)',
    pointerEvents: 'none',
  },

  // Story Beat Overlays
  storyBeat: {
    position: 'absolute',
    zIndex: 20,
    maxWidth: '400px',
    padding: '24px 32px',
    background: 'rgba(244, 244, 244, 0.92)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    borderRadius: '16px',
    boxShadow: softShadow,
    border: '1px solid rgba(255,255,255,0.6)',
    transition: 'opacity 0.4s ease-out',
  },
  storyBeatTitle: {
    fontSize: '28px',
    fontWeight: 600,
    color: '#111827',
    margin: '0 0 8px 0',
    letterSpacing: '-0.02em',
  },
  storyBeatDesc: {
    fontSize: '15px',
    color: '#6B7280',
    margin: 0,
    lineHeight: 1.5,
  },

  // Upload Card
  uploadCard: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '280px',
    background: '#f4f4f4',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: softShadow,
    zIndex: 30,
  },

  // Dropzone
  dropzone: {
    border: '2px dashed rgba(0, 0, 0, 0.15)',
    borderRadius: '12px',
    padding: '24px 16px',
    textAlign: 'center',
    background: '#e8e8ec',
    cursor: 'pointer',
    boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.08), inset -1px -1px 3px rgba(255,255,255,0.5)',
  },
  dropzoneActive: {
    borderColor: '#3B82F6',
    background: '#e0e4ec',
  },
  dropIcon: {
    marginBottom: '8px',
  },
  dropText: {
    margin: '0 0 12px 0',
    color: '#6B7280',
    fontSize: '14px',
  },
  browseBtn: {
    display: 'inline-block',
    padding: '10px 24px',
    background: '#111827',
    color: '#ffffff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  fileInput: {
    display: 'none',
  },
  
  // FM Sidecar Section
  fmSidecarSection: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(0, 0, 0, 0.06)',
  },
  fmSidecarLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    color: '#9CA3AF',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: '6px',
    transition: 'all 0.15s ease',
  },
  fmSidecarSelected: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '6px 10px',
    background: 'rgba(16, 185, 129, 0.08)',
    borderRadius: '6px',
    fontSize: '12px',
  },
  fmSidecarName: {
    color: '#059669',
    fontWeight: 500,
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fmSidecarClear: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    cursor: 'pointer',
    padding: '0 4px',
    fontSize: '16px',
    lineHeight: 1,
  },

  // Processing
  processing: {
    padding: '20px 8px',
    textAlign: 'center',
  },
  spinner: {
    width: '28px',
    height: '28px',
    border: '3px solid #F3F4F6',
    borderTopColor: '#111827',
    borderRadius: '50%',
    margin: '0 auto 12px',
    animation: 'spin 1s linear infinite',
  },
  progressText: {
    margin: 0,
    color: '#111827',
    fontSize: '14px',
    fontWeight: 500,
  },

  // Stage List
  stageList: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
  },
  stageItem: {
    display: 'flex',
    gap: '10px',
    minHeight: '36px',
  },
  stageIconCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '20px',
  },
  stageDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    transition: 'all 0.3s ease',
  },
  stageLine: {
    width: '2px',
    flex: 1,
    margin: '2px 0',
    borderRadius: '1px',
  },
  stageContent: {
    flex: 1,
    paddingBottom: '8px',
  },
  stageLabel: {
    fontSize: '12px',
    fontWeight: 500,
  },

  // Error
  errorBox: {
    padding: '16px',
    textAlign: 'center',
  },
  errorText: {
    margin: '0 0 12px 0',
    color: '#EF4444',
    fontSize: '13px',
  },
  retryBtn: {
    padding: '8px 16px',
    background: '#111827',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },

  // Frame Counter (debug)
  frameCounter: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    padding: '6px 12px',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: 'monospace',
    zIndex: 50,
  },

  // Mini Panel
  miniPanel: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
  },
  newModelBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: '#f4f4f4',
    border: 'none',
    borderRadius: '8px',
    color: '#111827',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    boxShadow: softShadow,
  },

  // Feature Section
  featureSection: {
    background: '#e8e8ec',
    padding: '100px 32px 120px',
  },
  featureSectionHeader: {
    textAlign: 'center',
    marginBottom: '48px',
    willChange: 'transform, opacity, filter',
  },
  featureSectionTitle: {
    fontSize: '32px',
    fontWeight: 600,
    color: '#111827',
    margin: '0 0 12px 0',
    letterSpacing: '-0.02em',
  },
  featureSectionDesc: {
    fontSize: '16px',
    color: '#6B7280',
    margin: 0,
  },
  featureGrid: {
    display: 'grid',
    gap: '24px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  featureCard: {
    background: '#f4f4f4',
    borderRadius: '16px',
    padding: '28px',
    boxShadow: softShadow,
    border: '1px solid rgba(255,255,255,0.6)',
    willChange: 'transform, opacity, filter',
  },
  featureIcon: {
    fontSize: '28px',
    display: 'block',
    marginBottom: '12px',
  },
  featureTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#111827',
    margin: '0 0 8px 0',
  },
  featureDesc: {
    fontSize: '14px',
    color: '#6B7280',
    margin: 0,
    lineHeight: 1.5,
  },
}

// Add CSS animations
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    nav a:hover {
      color: #111827 !important;
    }

    html {
      scroll-behavior: smooth;
    }

    @media (prefers-reduced-motion: reduce) {
      html {
        scroll-behavior: auto;
      }
      * {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }
  `
  document.head.appendChild(styleSheet)
}

export default UploadPanel

