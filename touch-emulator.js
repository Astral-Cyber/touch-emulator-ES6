'use strict';

let isMultiTouch = false;
let multiTouchStartPos;
let eventTarget;
let touchElements = {};

// polyfills
if (!document.createTouch) {
    document.createTouch = function (view, target, identifier, pageX, pageY, screenX, screenY, clientX, clientY) {
        // auto set
        if (clientX == undefined || clientY == undefined) {
            clientX = pageX - window.pageXOffset;
            clientY = pageY - window.pageYOffset;
        }

        return new Touch(target, identifier, {
            pageX: pageX,
            pageY: pageY,
            screenX: screenX,
            screenY: screenY,
            clientX: clientX,
            clientY: clientY
        });
    };
}

if (!document.createTouchList) {
    document.createTouchList = function () {
        let touchList = new TouchList();
        for (let i = 0; i < arguments.length; i++) {
            touchList[i] = arguments[i];
        }
        touchList.length = arguments.length;
        return touchList;
    };
}

/**
 * 创建一个触摸点
 * @constructor
 * @param target
 * @param identifier
 * @param pos
 * @param deltaX
 * @param deltaY
 * @returns {Object} touchPoint
 */
function Touch(target, identifier, pos, deltaX, deltaY) {
    deltaX = deltaX || 0;
    deltaY = deltaY || 0;

    this.identifier = identifier;
    this.target = target;
    this.clientX = pos.clientX + deltaX;
    this.clientY = pos.clientY + deltaY;
    this.screenX = pos.screenX + deltaX;
    this.screenY = pos.screenY + deltaY;
    this.pageX = pos.pageX + deltaX;
    this.pageY = pos.pageY + deltaY;
}

/**
 * 创建一个空的触摸列表，其中包含方法
 * @constructor
 * @returns touchList
 */
function TouchList() {
    let touchList = [];

    touchList.item = function (index) {
        return this[index] || null;
    };

    //  为 Mozilla 指定
    touchList.identifiedTouch = function (id) {
        return this[id + 1] || null;
    };

    return touchList;
}

/**
 * 假冒触摸事件支持
 * 这对于大多数库，如 Modernizr 和 Hammer，已经足够了
 */
function fakeTouchSupport() {
    let objs = [window, document.documentElement];
    let props = ['ontouchstart', 'ontouchmove', 'ontouchcancel', 'ontouchend'];

    for (let o = 0; o < objs.length; o++) {
        for (let p = 0; p < props.length; p++) {
            if (objs[o] && objs[o][props[p]] == undefined) {
                objs[o][props[p]] = null;
            }
        }
    }
}

/**
 * 不需要在触摸设备上模拟
 * @returns {boolean}
 */
function hasTouchSupport() {
    return ("ontouchstart" in window) || // touch events
        (window.Modernizr && window.Modernizr.touch) || // modernizr
        (navigator.msMaxTouchPoints || navigator.maxTouchPoints) > 2; // pointer events
}

/**
 * 在页面上禁用鼠标事件
 * @param ev
 */
function preventMouseEvents(ev) {
    ev.preventDefault();
    ev.stopPropagation();
}

/**
 * 只有当按下鼠标左键时才触发触摸
 * @param touchType
 * @returns {Function}
 */
function onMouse(touchType) {
    return function (ev) {
        if (TouchEmulator.ignoreTags.indexOf(ev.target.tagName) < 0) {
            // prevent mouse events
            preventMouseEvents(ev);
        }

        if (ev.which !== 1) {
            return;
        }

        // The EventTarget on which the touch point started when it was first placed on the surface,
        // even if the touch point has since moved outside the interactive area of that element.
        // also, when the target doesnt exist anymore, we update it
        if (ev.type === 'mousedown' || !eventTarget || (eventTarget && !eventTarget.dispatchEvent)) {
            if (ev.composedPath() && ev.composedPath().length > 0) {
                eventTarget = ev.composedPath()[0];
            } else {
                eventTarget = ev.target;
            }
        }

        // shiftKey has been lost, so trigger a touchend
        if (isMultiTouch && !ev.shiftKey) {
            triggerTouch('touchend', ev);
            isMultiTouch = false;
        }

        triggerTouch(touchType, ev);

        // we're entering the multi-touch mode!
        if (!isMultiTouch && ev.shiftKey) {
            isMultiTouch = true;
            multiTouchStartPos = {
                pageX: ev.pageX,
                pageY: ev.pageY,
                clientX: ev.clientX,
                clientY: ev.clientY,
                screenX: ev.screenX,
                screenY: ev.screenY
            };
            triggerTouch('touchstart', ev);
        }

        // reset
        if (ev.type === 'mouseup') {
            multiTouchStartPos = null;
            isMultiTouch = false;
            eventTarget = null;
        }
    }
}

/**
 * 触发一个触摸事件
 * @param eventName
 * @param mouseEv
 */
function triggerTouch(eventName, mouseEv) {
    let touchEvent = document.createEvent('Event');
    touchEvent.initEvent(eventName, true, true);

    touchEvent.altKey = mouseEv.altKey;
    touchEvent.ctrlKey = mouseEv.ctrlKey;
    touchEvent.metaKey = mouseEv.metaKey;
    touchEvent.shiftKey = mouseEv.shiftKey;

    touchEvent.touches = getActiveTouches(mouseEv, eventName);
    touchEvent.targetTouches = getActiveTouches(mouseEv, eventName);
    touchEvent.changedTouches = getChangedTouches(mouseEv, eventName);

    eventTarget.dispatchEvent(touchEvent);
}

/**
 * 根据鼠标事件创建一个触摸列表
 * @param mouseEv
 * @returns {TouchList}
 */
function createTouchList(mouseEv) {
    let touchList = new TouchList();

    if (isMultiTouch) {
        let f = TouchEmulator.multiTouchOffset;
        let deltaX = multiTouchStartPos.pageX - mouseEv.pageX;
        let deltaY = multiTouchStartPos.pageY - mouseEv.pageY;

        touchList.push(new Touch(eventTarget, 1, multiTouchStartPos, (deltaX * -1) - f, (deltaY * -1) + f));
        touchList.push(new Touch(eventTarget, 2, multiTouchStartPos, deltaX + f, deltaY - f));
    } else {
        touchList.push(new Touch(eventTarget, 1, mouseEv, 0, 0));
    }

    return touchList;
}

/**
 * 接收所有活动的触摸
 * @param mouseEv
 * @returns {TouchList}
 */
function getActiveTouches(mouseEv, eventName) {
    // 空列表
    if (mouseEv.type === 'mouseup') {
        return new TouchList();
    }

    let touchList = createTouchList(mouseEv);
    if (isMultiTouch && mouseEv.type !== 'mouseup' && eventName === 'touchend') {
        touchList.splice(1, 1);
    }
    return touchList;
}

/**
 * 接收一组过滤后的触摸，其中只包含已更改的指针
 * @param mouseEv
 * @param eventName
 * @returns {TouchList}
 */
function getChangedTouches(mouseEv, eventName) {
    let touchList = createTouchList(mouseEv);

    // 我们只想在多点触控时返回添加/移除的项目
    // 这是第二个指针，所以从 touchList 中移除第一个指针
    // 但是，当 mouseEv.type 是 mouseup 时，我们希望发送所有触摸，因为那样
    // 不可能再有新的输入了
    if (isMultiTouch && mouseEv.type !== 'mouseup' &&
        (eventName === 'touchstart' || eventName === 'touchend')) {
        touchList.splice(0, 1);
    }

    return touchList;
}

/**
 * 显示屏幕上的触摸点
 */
function showTouches(ev) {
    let touch, i, el, styles;

    // 首先所有可见的触摸
    for (i = 0; i < ev.touches.length; i++) {
        touch = ev.touches[i];
        el = touchElements[touch.identifier];
        if (!el) {
            el = touchElements[touch.identifier] = document.createElement("div");
            document.body.appendChild(el);
        }

        styles = TouchEmulator.template(touch);
        for (let prop in styles) {
            el.style[prop] = styles[prop];
        }
    }

    // 删除所有结束的触摸
    if (ev.type === 'touchend' || ev.type === 'touchcancel') {
        for (i = 0; i < ev.changedTouches.length; i++) {
            touch = ev.changedTouches[i];
            el = touchElements[touch.identifier];
            if (el) {
                el.parentNode.removeChild(el);
                delete touchElements[touch.identifier];
            }
        }
    }
}

/**
 * 触摸模拟器初始化器
 * 默认值为true
 */
function TouchEmulator(isShowTouches=true) {
    if (hasTouchSupport()) {
        return;
    }

    fakeTouchSupport();

    window.addEventListener("mousedown", onMouse('touchstart'), true);
    window.addEventListener("mousemove", onMouse('touchmove'), true);
    window.addEventListener("mouseup", onMouse('touchend'), true);

    window.addEventListener("mouseenter", preventMouseEvents, true);
    window.addEventListener("mouseleave", preventMouseEvents, true);
    window.addEventListener("mouseout", preventMouseEvents, true);
    window.addEventListener("mouseover", preventMouseEvents, true);

    if (isShowTouches) {
        window.addEventListener("touchstart", showTouches, true);
        window.addEventListener("touchmove", showTouches, true);
        window.addEventListener("touchend", showTouches, true);
        window.addEventListener("touchcancel", showTouches, true);
    }
}

// 进入多点触控模式时的起始距离
TouchEmulator.multiTouchOffset = 75;

// 不应吞没鼠标事件的标签
TouchEmulator.ignoreTags = ['TEXTAREA', 'INPUT', 'SELECT'];

/**
 * 触摸渲染的 CSS 模板
 * @param touch
 * @returns object
 */
TouchEmulator.template = function (touch) {
    let size = 30;
    let transform = 'translate(' + (touch.clientX - (size / 2)) + 'px, ' + (touch.clientY - (size / 2)) + 'px)';
    return {
        position: 'fixed',
        left: 0,
        top: 0,
        background: '#fff',
        border: 'solid 1px #999',
        opacity: '.6',
        borderRadius: '100%',
        height: size + 'px',
        width: size + 'px',
        padding: 0,
        margin: 0,
        display: 'block',
        overflow: 'hidden',
        pointerEvents: 'none',
        webkitUserSelect: 'none',
        mozUserSelect: 'none',
        userSelect: 'none',
        webkitTransform: transform,
        mozTransform: transform,
        transform: transform,
        zIndex: 100
    }
};
export default TouchEmulator;
