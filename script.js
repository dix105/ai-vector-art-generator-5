document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // CONFIGURATION & STATE
    // ==========================================
    const USER_ID = 'DObRu1vyStbUynoQmTcHBlhs55z2';
    const API_BASE = 'https://api.chromastudio.ai';
    const POLL_INTERVAL = 2000;
    const MAX_POLLS = 60;
    
    let currentUploadedUrl = null;

    // ==========================================
    // API FUNCTIONS (REQUIRED)
    // ==========================================

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage (called immediately when file is selected)
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            `${API_BASE}/get-emd-upload-url?fileName=` + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        console.log('Got signed URL');
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        console.log('Uploaded to:', downloadUrl);
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        const endpoint = `${API_BASE}/image-gen`;
        
        const body = {
            model: 'image-effects',
            toolType: 'image-effects',
            effectId: 'photoToVectorArt',
            imageUrl: imageUrl,
            userId: USER_ID,
            removeWatermark: true,
            isPrivate: true
        };
    
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        console.log('Job submitted:', data.jobId, 'Status:', data.status);
        return data;
    }

    // Poll job status until completed or failed
    async function pollJobStatus(jobId) {
        const baseUrl = `${API_BASE}/image-gen`;
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${USER_ID}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            console.log('Poll', polls + 1, '- Status:', data.status);
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Update UI with progress
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // ==========================================
    // UI HELPER FUNCTIONS
    // ==========================================

    function showLoading() {
        const resultContainer = document.getElementById('result-container');
        if (resultContainer) {
            // Keep the grid background if possible, just overlay loader
            resultContainer.innerHTML = `
                <div class="vector-grid-bg"></div>
                <div class="loader" id="loading-state"></div>
                <p id="status-text" style="margin-top:1rem; z-index:5;">Processing...</p>
            `;
        }
    }

    function hideLoading() {
        // Handled by showResultMedia overwriting content
    }

    function updateStatus(text) {
        // Update the status text in the result container
        const statusText = document.getElementById('status-text');
        if (statusText) statusText.textContent = text;
        
        // Update button state
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            if (text.includes('PROCESSING') || text.includes('UPLOADING')) {
                generateBtn.disabled = true;
                generateBtn.textContent = text;
            } else if (text === 'READY') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Vector Art';
            }
        }
    }

    function showError(msg) {
        alert('Error: ' + msg);
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.textContent = 'Generate Vector Art';
            generateBtn.disabled = false;
        }
        const resultContainer = document.getElementById('result-container');
        if (resultContainer) {
            resultContainer.innerHTML = `
                <div class="vector-grid-bg"></div>
                <p style="color:red">Error: ${msg}</p>
            `;
        }
    }

    function showPreview(url) {
        const img = document.getElementById('preview-image');
        const uploadContent = document.querySelector('.upload-content');
        if (img) {
            img.src = url;
            img.style.display = 'block';
        }
        if (uploadContent) uploadContent.style.display = 'none';
    }

    function showResultMedia(url) {
        const resultContainer = document.getElementById('result-container');
        if (!resultContainer) return;

        // Clear container and setup result
        resultContainer.innerHTML = '';
        
        // Add grid bg back
        const grid = document.createElement('div');
        grid.className = 'vector-grid-bg';
        resultContainer.appendChild(grid);

        // Create Image
        const resultImg = document.createElement('img');
        resultImg.id = 'result-final';
        resultImg.className = 'result-image';
        // Add cache buster
        resultImg.src = url + '?t=' + new Date().getTime();
        
        resultContainer.appendChild(resultImg);
    }

    function showDownloadButton(url) {
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.disabled = false;
        }
    }

    // ==========================================
    // CORE HANDLERS
    // ==========================================

    async function handleFileSelect(file) {
        if (!file) return;
        
        try {
            // UI Setup
            const uploadContent = document.querySelector('.upload-content');
            const previewImg = document.getElementById('preview-image');
            
            // Show local preview immediately for better UX
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onloadend = function() {
                if(previewImg) {
                    previewImg.src = reader.result;
                    previewImg.style.display = 'block';
                }
                if(uploadContent) uploadContent.style.display = 'none';
            }

            // Start Upload
            updateStatus('UPLOADING...');
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Update UI to Ready state
            updateStatus('READY');
            
        } catch (error) {
            console.error(error);
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    async function handleGenerate() {
        if (!currentUploadedUrl) {
            alert('Please upload an image first.');
            return;
        }
        
        try {
            showLoading();
            updateStatus('SUBMITTING JOB...');
            
            // Step 1: Submit job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            updateStatus('JOB QUEUED...');
            
            // Step 2: Poll for completion
            const result = await pollJobStatus(jobData.jobId);
            
            // Step 3: Extract Result URL
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.image;
            
            if (!resultUrl) {
                throw new Error('No image URL in response');
            }
            
            console.log('Result URL:', resultUrl);
            
            // Step 4: Display Result
            showResultMedia(resultUrl);
            showDownloadButton(resultUrl);
            updateStatus('COMPLETE'); // Resets button text
            
        } catch (error) {
            console.error(error);
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // ==========================================
    // DOM ELEMENTS & WIRING
    // ==========================================
    
    const dropZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const downloadBtn = document.getElementById('download-btn');

    // File Input Change
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // Drag & Drop
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
        });

        dropZone.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        }, false);

        dropZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });
    }

    // Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentUploadedUrl = null;
            const previewImg = document.getElementById('preview-image');
            const uploadContent = document.querySelector('.upload-content');
            const resultContainer = document.getElementById('result-container');
            const fileInput = document.getElementById('file-input');

            if (previewImg) {
                previewImg.src = '';
                previewImg.style.display = 'none';
            }
            if (uploadContent) uploadContent.style.display = 'block';
            if (fileInput) fileInput.value = '';
            
            if (resultContainer) {
                resultContainer.innerHTML = `
                    <div class="placeholder-state">
                        <div class="vector-grid-bg"></div>
                        <p>Artboard Empty</p>
                    </div>
                `;
            }
            
            if (downloadBtn) {
                downloadBtn.disabled = true;
                downloadBtn.textContent = 'Download Vector Art';
                delete downloadBtn.dataset.url;
            }

            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Vector Art';
            }
        });
    }

    // Download Button - Robust Strategy
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            function downloadBlob(blob, filename) {
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            }
            
            function getExtension(url, contentType) {
                if (contentType) {
                    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
                    if (contentType.includes('png')) return 'png';
                }
                const match = url.match(/\.(jpe?g|png|webp)/i);
                return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
            }
            
            try {
                // STRATEGY 1: Proxy
                const proxyUrl = 'https://api.chromastudio.ai/download-proxy?url=' + encodeURIComponent(url);
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Proxy failed');
                
                const blob = await response.blob();
                const ext = getExtension(url, response.headers.get('content-type'));
                downloadBlob(blob, 'vector-art-' + generateNanoId(8) + '.' + ext);
                
            } catch (proxyErr) {
                console.warn('Proxy download failed, trying direct:', proxyErr);
                
                // STRATEGY 2: Direct
                try {
                    const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
                    const response = await fetch(fetchUrl, { mode: 'cors' });
                    
                    if (response.ok) {
                        const blob = await response.blob();
                        const ext = getExtension(url, response.headers.get('content-type'));
                        downloadBlob(blob, 'vector-art-' + generateNanoId(8) + '.' + ext);
                        return;
                    }
                    throw new Error('Direct fetch failed');
                } catch (fetchErr) {
                    console.warn('Direct fetch failed:', fetchErr);
                    alert('Download failed due to browser security. Please right-click the image and "Save Image As".');
                }
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    // ==========================================
    // LEGACY UI LOGIC (Menus, Animations, etc.)
    // ==========================================

    // Mobile Menu
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileBtn && navLinks) {
        mobileBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });

        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
            });
        });
    }

    // Hero Animation (Dynamic Vector Shapes)
    const heroAnimation = document.getElementById('hero-animation');
    
    function createVectorShape() {
        if (!heroAnimation) return;

        const shape = document.createElement('div');
        const type = Math.random() > 0.5 ? 'square' : (Math.random() > 0.5 ? 'circle' : 'triangle');
        const size = Math.floor(Math.random() * 60) + 40; 
        
        shape.classList.add('vector-shape', type);
        
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        
        shape.style.width = `${size}px`;
        shape.style.height = `${size}px`;
        shape.style.left = `${x}%`;
        shape.style.top = `${y}%`;

        if (type === 'triangle') {
            shape.style.borderWidth = `0 ${size/2}px ${size}px ${size/2}px`;
            shape.style.borderColor = `transparent transparent var(--primary) transparent`;
        }

        if (type !== 'triangle' && type !== 'circle') {
            const anchors = ['tl', 'tr', 'bl', 'br'];
            anchors.forEach(pos => {
                const node = document.createElement('div');
                node.classList.add('anchor-node');
                if(pos.includes('t')) node.style.top = '-3px'; else node.style.bottom = '-3px';
                if(pos.includes('l')) node.style.left = '-3px'; else node.style.right = '-3px';
                shape.appendChild(node);
            });
        }

        heroAnimation.appendChild(shape);
        setTimeout(() => shape.remove(), 4000);
    }

    if (heroAnimation) {
        setInterval(createVectorShape, 1500);
    }

    // FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                faqItems.forEach(i => {
                    i.classList.remove('active');
                    const ans = i.querySelector('.faq-answer');
                    const icon = i.querySelector('.faq-icon');
                    if(ans) ans.style.maxHeight = null;
                    if(icon) icon.textContent = '+';
                });

                if (!isActive) {
                    item.classList.add('active');
                    const answer = item.querySelector('.faq-answer');
                    if(answer) answer.style.maxHeight = answer.scrollHeight + "px";
                    item.querySelector('.faq-icon').textContent = '-';
                }
            });
        }
    });

    // Modals
    const modalIds = ['privacy', 'terms'];
    modalIds.forEach(id => {
        const btn = document.getElementById(`btn-${id}`);
        const modal = document.getElementById(`${id}-modal`);
        
        if (btn && modal) {
            const closeSpan = modal.querySelector('.modal-close');
            btn.addEventListener('click', () => modal.style.display = "block");
            
            if(closeSpan) {
                closeSpan.addEventListener('click', () => modal.style.display = "none");
            }

            window.addEventListener('click', (event) => {
                if (event.target == modal) modal.style.display = "none";
            });
        }
    });

});