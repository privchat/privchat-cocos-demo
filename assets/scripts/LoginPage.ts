// Login page — PLATFORM account-mode flow (privchat-server account
// mode = platform, per spec ACCOUNT_IDENTITY_SPEC / TOKEN_UNIFICATION
// §1.2). Two-step UX modeled after Telegram / WhatsApp:
//
//   Step 1 (phone):
//     ┌────────────────────────────┐
//     │       PrivChat 登录         │
//     │   PLATFORM · 手机号验证      │
//     │                            │
//     │  ┌──────────────────────┐  │
//     │  │ 🇨🇳 中国  +86      › │  │  ← tap → ActionSheet picker
//     │  └──────────────────────┘  │
//     │  ┌──────────────────────┐  │
//     │  │ 138 1234 5678        │  │  ← phone input
//     │  └──────────────────────┘  │
//     │   [ ⚠ 请输入正确的手机号 ]   │  ← red error (only when invalid)
//     │                            │
//     │  ┌──────────────────────┐  │
//     │  │        继续           │  │
//     │  └──────────────────────┘  │
//     └────────────────────────────┘
//
//   Step 2 (code):
//     ┌────────────────────────────┐
//     │  ← 返回                     │
//     │                            │
//     │       输入验证码             │
//     │   已发送至 +86 138****5678  │
//     │                            │
//     │   ┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐       │  ← 6 cells, auto-submit at 6 digits
//     │   │1││2││3│└─┘└─┘└─┘       │
//     │   └─┘└─┘└─┘                │
//     │                            │
//     │      [ 重新发送 (52s) ]     │  ← resend with cooldown carryover
//     └────────────────────────────┘
//
// Validation:
//   - China (+86): mobile must be exactly 11 digits AND start with '1'
//   - Other countries: minimum 6 digits (don't validate the world)
//   - Validation only runs on 继续 tap, not while typing (less noisy)
//
// Mock mode: any country + any phone + any 6-digit code passes.
// Real mode: 继续 calls `onSendSmsCode(fullMobile)` → on resolve
// advances to step 2; 6th digit entered → `onLogin({mobile, smsCode})`.

import { Color, EditBox, Graphics, Label, Node, UITransform } from 'cc';
import type { ThemeConfig } from '@privchat/cocos';
import {
  createButtonBase,
  createNavBar,
  createTextInput,
  getUiTheme,
  showActionSheet,
  NAV_BAR_HEIGHT,
  type ActionItem,
  type ButtonBaseHandle,
  type TextInputHandle,
} from '@privchat/cocos';

export interface LoginCredentials {
  /** Full international mobile, e.g. "+8613812345678". */
  mobile: string;
  smsCode: string;
}

export interface LoginPageOptions {
  root: Node;
  theme: ThemeConfig;
  /** Fired when the user taps 继续 on the phone step. Resolve →
   *  advance to code step. Reject → stay on phone step (host shows
   *  toast / error message). */
  onSendSmsCode?: (mobile: string) => Promise<void>;
  /** Fired automatically when the 6th digit of the code is entered
   *  on step 2. */
  onLogin: (creds: LoginCredentials) => void;
}

export interface LoginPageHandle {
  /** 显示 OTP 页的错误提示（验证码过期、错误、网络异常等）。
   *  调用后：错误文本显示在 6 格下方、所有 OTP 框清空并解锁、登录按钮
   *  禁用、焦点回到第一格。`null` / 空串清除错误。
   *  仅在 step=code 时生效；step=phone 时是 no-op。 */
  setCodeError(message: string | null): void;
  dispose(): void;
}

interface RGBA { r: number; g: number; b: number; a: number; }

interface Country {
  /** ISO 3166-1 alpha-2 (for keying). */
  iso: string;
  /** Localized name. */
  name: string;
  /** Dial code with leading +. */
  dial: string;
  /** Emoji flag. Cocos's default font may not render emoji on every
   *  platform — falls back gracefully to plain text on bare builds. */
  flag: string;
}

const COUNTRIES: ReadonlyArray<Country> = [
  { iso: 'CN', name: '中国大陆', dial: '+86', flag: '🇨🇳' },
  { iso: 'HK', name: '中国香港', dial: '+852', flag: '🇭🇰' },
  { iso: 'MO', name: '中国澳门', dial: '+853', flag: '🇲🇴' },
  { iso: 'TW', name: '中国台湾', dial: '+886', flag: '🇹🇼' },
  { iso: 'US', name: '美国 / 加拿大', dial: '+1', flag: '🇺🇸' },
  { iso: 'JP', name: '日本', dial: '+81', flag: '🇯🇵' },
  { iso: 'KR', name: '韩国', dial: '+82', flag: '🇰🇷' },
  { iso: 'SG', name: '新加坡', dial: '+65', flag: '🇸🇬' },
];

const FORM_WIDTH = 280;
const FIELD_HEIGHT = 48;
const FIELD_GAP = 14;
const TITLE_FONT = 26;
const SMS_RESEND_COOLDOWN_S = 60;
const SMS_CODE_LEN = 6;

// Step 2 OTP cell layout.
const OTP_CELL_W = 38;
const OTP_CELL_H = 50;
const OTP_CELL_GAP = 8;
const OTP_ROW_WIDTH = OTP_CELL_W * SMS_CODE_LEN + OTP_CELL_GAP * (SMS_CODE_LEN - 1);

export function createLoginPage(opts: LoginPageOptions): LoginPageHandle {
  const { root, theme, onSendSmsCode, onLogin } = opts;
  const uiTheme = getUiTheme(theme);
  const ui = root.getComponent(UITransform) ?? root.addComponent(UITransform);
  const width = ui.width || 360;
  const height = ui.height || 640;

  const colorBg = parseHex(theme.colors.background);
  const colorText = parseHex(theme.colors.textPrimary);
  const colorTextSecondary = parseHex(theme.colors.textSecondary);
  const colorPrimary = parseHex(theme.colors.primary);
  const colorSurface = parseHex(uiTheme.colors.surface);
  const colorBorder = parseHex(uiTheme.colors.border);

  // ----- Persistent page background (survives step transitions) -----
  const bg = createPlainRect('LoginBackground', width, height, colorBg);
  bg.setPosition(0, 0);
  root.addChild(bg);

  // ----- Step state -----
  // Step handle carries per-step methods (only `setError` so far,
  // exposed by the code step). Phone step doesn't need any so its
  // handle leaves the field undefined.
  interface StepHandle {
    dispose(): void;
    setError?(message: string | null): void;
  }
  let currentStep: StepHandle | null = null;
  let currentStepKind: 'phone' | 'code' = 'phone';
  let selected: Country = COUNTRIES[0]; // 中国 +86 默认
  let phoneNumber = '';
  // Cooldown carried across step transitions — if user goes back to
  // step 1 mid-cooldown and re-enters step 2 (without changing the
  // mobile), they should still see the running countdown.
  let cooldownRemainingShared = 0;
  let cooldownTimerShared: ReturnType<typeof setInterval> | null = null;

  function clearCooldownTimer(): void {
    if (cooldownTimerShared != null) {
      clearInterval(cooldownTimerShared);
      cooldownTimerShared = null;
    }
  }

  function showPhoneStep(): void {
    currentStep?.dispose();
    currentStepKind = 'phone';
    currentStep = renderPhoneStep();
  }
  function showCodeStep(): void {
    currentStep?.dispose();
    currentStepKind = 'code';
    currentStep = renderCodeStep();
  }

  // ===== STEP 1: phone =====
  function renderPhoneStep(): { dispose: () => void } {
    const nodes: Node[] = [];
    const handles: Array<{ dispose(): void }> = [];

    // Title + subtitle.
    const title = createPlainLabel('LoginTitle', {
      text: 'PrivChat 登录',
      fontSize: TITLE_FONT,
      color: colorText,
      width: FORM_WIDTH,
      height: 36,
    });
    title.setPosition(0, height / 4 + 16);
    root.addChild(title);
    nodes.push(title);

    const subtitle = createPlainLabel('LoginSubtitle', {
      text: 'PLATFORM 模式 · 手机号 + 验证码',
      fontSize: 12,
      color: colorTextSecondary,
      width: FORM_WIDTH,
      height: 18,
    });
    subtitle.setPosition(0, height / 4 - 12);
    root.addChild(subtitle);
    nodes.push(subtitle);

    // Layout from top to bottom inside the form area. The phone
    // input renders its own inline error label below itself (via the
    // kit's `TextInput.setError` API), so we leave ~26px of vertical
    // breathing room between the input bottom and the continue
    // button to accommodate the error row when shown.
    const country_Y = 28;
    const phoneY = country_Y - (FIELD_HEIGHT + FIELD_GAP);
    const continueY = phoneY - (FIELD_HEIGHT + 26 + FIELD_GAP);

    // ----- Country picker (button-shaped row) -----
    const countryRow = makeFormSlot(root, 0, country_Y);
    nodes.push(countryRow);
    const countryBg = createRoundedRect(
      'CountryBg',
      FORM_WIDTH,
      FIELD_HEIGHT,
      uiTheme.radius.md,
      colorSurface,
      colorBorder,
      1,
    );
    countryRow.addChild(countryBg);

    // Country label rebuilt each time selected changes.
    let countryLabel = renderCountryLabel(countryBg);
    function refreshCountryLabel(): void {
      countryLabel.removeFromParent();
      countryLabel.destroy();
      countryLabel = renderCountryLabel(countryBg);
    }

    // Make the entire row tappable: cc.Node 'touch-end' on the
    // background. No cc.Button needed for v1 (no visual press state).
    countryBg.on('touch-end', () => openCountryPicker());

    // ----- Phone input -----
    // `TextInput.setError(msg)` paints the input border in danger
    // color and renders a `theme.fontSize.sm` (13px) label below the
    // input. Hosts no longer need to draw their own error label —
    // the input owns its inline error state.
    //
    // maxLength + placeholder 跟着所选国家走：中国大陆固定 11 位，
    // 其他地区放到 15 位（够装常见国际号；E.164 总长上限 15 位）。
    // 切换国家时通过 phoneField.setMaxLength / setPlaceholder 同步。
    const phoneSlot = makeFormSlot(root, 0, phoneY);
    nodes.push(phoneSlot);
    const phoneField: TextInputHandle = createTextInput({
      parent: phoneSlot,
      theme: uiTheme,
      width: FORM_WIDTH,
      height: FIELD_HEIGHT,
      placeholder: phonePlaceholderFor(selected),
      maxLength: phoneMaxLengthFor(selected),
      value: phoneNumber,
      onChange: (v) => {
        phoneNumber = v;
        phoneField.setError(null);
      },
    });
    handles.push(phoneField);
    // Force tel keyboard on mobile.
    setEditBoxTelMode(phoneSlot);

    // ----- Continue button -----
    let submitting = false;
    const continueBtn: ButtonBaseHandle = createButtonBase({
      theme: uiTheme,
      label: '继续',
      variant: 'primary',
      width: FORM_WIDTH,
      height: FIELD_HEIGHT,
      onClick: () => triggerContinue(),
    });
    continueBtn.node.setPosition(0, continueY);
    root.addChild(continueBtn.node);
    handles.push(continueBtn);

    function triggerContinue(): void {
      if (submitting) return;
      const raw = phoneField.getValue().trim();
      const err = validatePhone(selected, raw);
      if (err) {
        phoneField.setError(err);
        return;
      }
      phoneField.setError(null);
      phoneNumber = raw;
      submitting = true;
      continueBtn.setLabel('发送中…');
      continueBtn.setDisabled(true);
      const fullMobile = formatFullMobile(selected, raw);
      const promise = onSendSmsCode
        ? onSendSmsCode(fullMobile)
        : Promise.resolve();
      promise
        .then(() => {
          submitting = false;
          startCooldown(); // start 60s before entering step 2
          showCodeStep();
        })
        .catch((e: unknown) => {
          submitting = false;
          continueBtn.setLabel('继续');
          continueBtn.setDisabled(false);
          phoneField.setError(formatApplicationError(e));
        });
    }

    function openCountryPicker(): void {
      const items: ActionItem[] = COUNTRIES.map((c) => ({
        label: `${c.flag}  ${c.name}  ${c.dial}${
          c.iso === selected.iso ? '  ✓' : ''
        }`,
        onClick: () => {
          selected = c;
          refreshCountryLabel();
          phoneField.setError(null);
          phoneField.setMaxLength(phoneMaxLengthFor(selected));
          phoneField.setPlaceholder(phonePlaceholderFor(selected));
          // 截断之后同步 phoneNumber 闭包变量
          phoneNumber = phoneField.getValue();
        },
      }));
      showActionSheet({
        parent: root,
        theme: uiTheme,
        title: '选择国家或地区',
        actions: items,
      });
    }

    return {
      dispose() {
        for (const h of handles) {
          try { h.dispose(); } catch { /* swallow */ }
        }
        for (const n of nodes) {
          n.removeFromParent();
          n.destroy();
        }
      },
    };
  }

  function renderCountryLabel(parent: Node): Node {
    const wrap = new Node('CountryRowText');
    wrap.addComponent(UITransform);
    parent.addChild(wrap);

    const label = createPlainLabel('CountryText', {
      text: `${selected.flag}  ${selected.name}     ${selected.dial}`,
      fontSize: 16,
      color: colorText,
      width: FORM_WIDTH - 32,
      height: FIELD_HEIGHT,
    });
    const labelLabel = label.getComponent(Label);
    if (labelLabel) labelLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    label.setPosition(-8, 0);
    wrap.addChild(label);

    const chevron = createPlainLabel('CountryChevron', {
      text: '›',
      fontSize: 20,
      color: colorTextSecondary,
      width: 16,
      height: FIELD_HEIGHT,
    });
    chevron.setPosition(FORM_WIDTH / 2 - 14, 0);
    wrap.addChild(chevron);

    return wrap;
  }

  // ===== STEP 2: code =====
  //
  // Step handle returned by renderCodeStep — explicit shape so the
  // outer `setCodeError` can pass through `setError` without TS
  // complaining about excess-property checks.
  //
  // Layout:
  //
  //   ┌──────────────────────────────────┐
  //   │ < 返回   输入验证码                │  ← createNavBar (NAV_BAR_HEIGHT)
  //   ├──────────────────────────────────┤
  //   │                                  │
  //   │       已发送至 +86 138****5678    │  ← 副标题 fontSize.md
  //   │                                  │
  //   │   ┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐             │  ← 6 个独立 TextInput
  //   │   │ ││ ││ ││ ││ ││ │             │     maxLength=1 + 焦点链
  //   │   └─┘└─┘└─┘└─┘└─┘└─┘             │
  //   │                                  │
  //   │         重新发送 (60s)             │  ← ghost 按钮，倒计时
  //   │                                  │
  //   │   ┌──────────────────────────┐   │
  //   │   │          登录             │   │  ← primary，6 位时自动触发
  //   │   └──────────────────────────┘   │
  //   └──────────────────────────────────┘
  //
  // 6 位 OTP 用 6 个独立 cc.EditBox（每个 maxLength=1）：上一版用
  // 「1 个隐藏 EditBox + 6 个假 cell」失败了 —— hideTextInputChrome
  // 在 setTimeout 里 clear Graphics 不可靠，EditBox 自带 chrome
  // 又被 Cocos 异步回填，导致整个 OTP 区显示成一个金色实心块。
  // 独立 EditBox 渲染稳定，缺点是需要手写焦点链（onChange 时跳
  // 下一格 / 清空时跳回上一格），但实现简单可靠。
  function renderCodeStep(): StepHandle {
    const nodes: Node[] = [];
    const handles: Array<{ dispose(): void }> = [];

    // ----- NavBar (UI Kit) -----
    const navBar = createNavBar({
      parent: root,
      width,
      theme,
      title: '输入验证码',
      onBack: () => {
        clearCooldownTimer();
        cooldownRemainingShared = 0;
        showPhoneStep();
      },
    });
    handles.push(navBar);

    // 顶部 NavBar 占用 NAV_BAR_HEIGHT，剩余空间从 height/2 - NAV_BAR_HEIGHT 起算。
    const contentTopY = height / 2 - NAV_BAR_HEIGHT;

    // ----- 副标题 -----
    // height 必须 ≥ fontSize × 1.5，否则 createPlainLabel 的
    // Label.Overflow.SHRINK 会自动把字号缩到容器塞得下，
    // 看上去就是「fontSize 没生效」。这里 18px 字 ×1.5 = 27，给 30
    // 留 3px 富余。同理下面的「重新发送」也是。
    const subtitle = createPlainLabel('CodeSubtitle', {
      text: `已发送至 ${formatMaskedMobile(selected, phoneNumber)}`,
      fontSize: 18,
      color: colorTextSecondary,
      width: FORM_WIDTH,
      height: 30,
    });
    const subtitleY = contentTopY - 40;
    subtitle.setPosition(0, subtitleY);
    root.addChild(subtitle);
    nodes.push(subtitle);

    // ----- 6 个独立 OTP TextInput -----
    const otpY = subtitleY - 60;
    const otpRow = new Node('OtpRow');
    otpRow.addComponent(UITransform);
    otpRow.setPosition(0, otpY);
    root.addChild(otpRow);
    nodes.push(otpRow);

    const otpInputs: TextInputHandle[] = [];
    const cellStartX = -OTP_ROW_WIDTH / 2 + OTP_CELL_W / 2;
    let suppressChange = false; // 防止 setValue 触发的 onChange 引起递归
    let currentOtp = '';

    function recomputeOtp(): string {
      return otpInputs.map((i) => i.getValue()).join('');
    }

    function onCellChange(idx: number, raw: string): void {
      if (suppressChange) return;
      // 只接受单个数字字符；多输入的字符（粘贴等）切到下一个格子
      const digits = raw.replace(/\D/g, '');
      const digit = digits.slice(0, 1);
      const overflow = digits.slice(1);
      if (digit !== raw) {
        suppressChange = true;
        otpInputs[idx].setValue(digit);
        suppressChange = false;
      }
      // 粘贴溢出 → 依次分配到后面的格子
      if (overflow.length > 0) {
        let cursor = idx + 1;
        for (const ch of overflow) {
          if (cursor >= SMS_CODE_LEN) break;
          suppressChange = true;
          otpInputs[cursor].setValue(ch);
          suppressChange = false;
          cursor += 1;
        }
        // 跳到第一个空格或最后一格
        const focusAt = Math.min(idx + overflow.length + 1, SMS_CODE_LEN - 1);
        otpInputs[focusAt].focus();
      } else if (digit && idx < SMS_CODE_LEN - 1) {
        // 单字输入 → 跳下一格
        otpInputs[idx + 1].focus();
      } else if (!digit && idx > 0) {
        // 清空 → 跳回上一格（用户按退格的场景）
        otpInputs[idx - 1].focus();
      }
      currentOtp = recomputeOtp();
      loginBtn.setDisabled(currentOtp.length !== SMS_CODE_LEN);
      if (currentOtp.length === SMS_CODE_LEN) {
        autoSubmit();
      }
    }

    // 当前焦点格子索引 —— 给 Backspace 监听用，判断退格时该退到哪。
    let focusedIdx = 0;

    for (let i = 0; i < SMS_CODE_LEN; i++) {
      const cellSlot = new Node(`OtpCellSlot${i}`);
      cellSlot.addComponent(UITransform);
      cellSlot.setPosition(cellStartX + i * (OTP_CELL_W + OTP_CELL_GAP), 0);
      otpRow.addChild(cellSlot);
      const idx = i;
      const handle: TextInputHandle = createTextInput({
        parent: cellSlot,
        theme: uiTheme,
        width: OTP_CELL_W,
        height: OTP_CELL_H,
        placeholder: '',
        // maxLength 故意 = SMS_CODE_LEN 而非 1：用户从短信复制 6
        // 位验证码粘贴到第一格时，cc.EditBox 会先按 maxLength 截断
        // 再触发 text-changed —— 设 1 就只剩首字符，溢出分支永远
        // 进不去。设 6 让粘贴的完整字符串落进 onCellChange，由它
        // 拆到后面的格子；onCellChange 同时会把当前格 setValue
        // 回到单字，所以视觉上每格还是只显示 1 个数字。
        maxLength: SMS_CODE_LEN,
        onChange: (v) => onCellChange(idx, v),
        onFocus: () => { focusedIdx = idx; },
      });
      setEditBoxTelMode(cellSlot);
      otpInputs.push(handle);
      handles.push(handle);
    }

    // 进入页面立刻聚焦第一格 —— 用户从「继续」跳过来就期望直接打字。
    setTimeout(() => otpInputs[0].focus(), 0);
    setTimeout(() => otpInputs[0].focus(), 80);

    // 退格回退：当用户在已空的格子上按 Backspace 时，cc.EditBox
    // 因 string 从 '' → '' 不变而不会发 text-changed —— 单靠
    // onCellChange 检测不到这次按键。这里挂全局 keydown，专门
    // 处理「空格子 + Backspace → 退到上一格并清空它」。
    const onBackspaceKey = (event: Event): void => {
      const e = event as KeyboardEvent;
      if (e.key !== 'Backspace') return;
      // 仅在 OTP 任一格子处于焦点 + 该格已空时介入
      if (focusedIdx <= 0) return;
      if (otpInputs[focusedIdx].getValue() !== '') return;
      e.preventDefault();
      suppressChange = true;
      otpInputs[focusedIdx - 1].setValue('');
      suppressChange = false;
      otpInputs[focusedIdx - 1].focus();
      currentOtp = recomputeOtp();
      loginBtn.setDisabled(currentOtp.length !== SMS_CODE_LEN);
    };
    const doc = (globalThis as { document?: Document }).document;
    doc?.addEventListener('keydown', onBackspaceKey, /*capture*/ true);
    handles.push({
      dispose() {
        doc?.removeEventListener('keydown', onBackspaceKey, true);
      },
    });

    // ----- 重新发送：Telegram 风格纯文字 link -----
    // 倒计时进行中 → 灰色不可点的提示文本（textSecondary）
    // 倒计时归零 → 金色可点的链接文本（primary）
    // 这跟 Telegram OTP 页"Re-send code"一致 —— 不要圆角按钮、不要
    // ghost 灰底块，就一行纯文字加颜色态切换。
    const resendY = otpY - OTP_CELL_H / 2 - 36;
    const resendNode = createPlainLabel('CodeResend', {
      text: cooldownLabel(),
      fontSize: 17,
      color: colorTextSecondary,
      width: FORM_WIDTH,
      height: 28,
    });
    resendNode.setPosition(0, resendY);
    root.addChild(resendNode);
    nodes.push(resendNode);
    const resendLabelComp = resendNode.getComponent(Label);

    let resendSending = false;
    function refreshResendLabel(): void {
      if (resendSending) return;
      if (resendLabelComp) {
        resendLabelComp.string = cooldownLabel();
        const c = cooldownRemainingShared > 0 ? colorTextSecondary : colorPrimary;
        resendLabelComp.color = new Color(c.r, c.g, c.b, c.a);
      }
    }
    refreshResendLabel();
    const refreshTicker = setInterval(refreshResendLabel, 500);
    handles.push({ dispose() { clearInterval(refreshTicker); } });

    // 点击只在倒计时归零时生效。直接挂在 Label 节点的 touch-end 上
    // —— Cocos 把鼠标点击自动转成 touch 事件，所以浏览器预览也行。
    resendNode.on('touch-end', () => triggerResend());

    function triggerResend(): void {
      if (cooldownRemainingShared > 0 || resendSending) return;
      resendSending = true;
      if (resendLabelComp) {
        resendLabelComp.string = '发送中…';
        resendLabelComp.color = new Color(
          colorTextSecondary.r,
          colorTextSecondary.g,
          colorTextSecondary.b,
          colorTextSecondary.a,
        );
      }
      const fullMobile = formatFullMobile(selected, phoneNumber);
      const promise = onSendSmsCode
        ? onSendSmsCode(fullMobile)
        : Promise.resolve();
      promise
        .then(() => {
          resendSending = false;
          startCooldown();
          refreshResendLabel();
        })
        .catch(() => {
          resendSending = false;
          refreshResendLabel();
        });
    }

    // ----- 错误提示 label -----
    // 位置在 OTP row 与 重新发送 link 之间。默认隐藏，宿主调
    // setError 时显示红字（验证码过期 / 错误 / 网络异常 等）。
    const errorY = otpY - OTP_CELL_H / 2 - 12;
    const errorNode = createPlainLabel('CodeError', {
      text: '',
      fontSize: 14,
      color: parseHex(theme.colors.danger),
      width: FORM_WIDTH,
      height: 22,
    });
    errorNode.setPosition(0, errorY);
    errorNode.active = false;
    root.addChild(errorNode);
    nodes.push(errorNode);
    const errorLabelComp = errorNode.getComponent(Label);

    // ----- 登录按钮（primary）-----
    // 默认 disabled；6 位填齐时启用。即使用户没主动点，6 位填齐
    // 也会自动触发 onLogin（autoSubmit）— 给手动点的兜底通道。
    let submitted = false;
    const loginBtn: ButtonBaseHandle = createButtonBase({
      theme: uiTheme,
      label: '登录',
      variant: 'primary',
      width: FORM_WIDTH,
      height: FIELD_HEIGHT,
      disabled: true,
      onClick: () => manualSubmit(),
    });
    loginBtn.node.setPosition(0, resendY - 60);
    root.addChild(loginBtn.node);
    handles.push(loginBtn);

    function autoSubmit(): void {
      if (submitted) return;
      submitted = true;
      // 提交时锁住所有输入，防止重复触发。如果之后 setError 被宿主
      // 调用（验证失败），会把这些状态再解锁让用户重试。
      for (const h of otpInputs) h.setDisabled(true);
      loginBtn.setDisabled(true);
      // 之前的错误（如果有）在重新提交时清掉
      setCodeError(null);
      const fullMobile = formatFullMobile(selected, phoneNumber);
      onLogin({ mobile: fullMobile, smsCode: currentOtp });
    }

    function manualSubmit(): void {
      if (currentOtp.length !== SMS_CODE_LEN) return;
      autoSubmit();
    }

    function setCodeError(message: string | null): void {
      const msg = message && message.length > 0 ? message : null;
      if (errorLabelComp && errorNode) {
        if (msg) {
          errorLabelComp.string = msg;
          errorNode.active = true;
        } else {
          errorLabelComp.string = '';
          errorNode.active = false;
        }
      }
      if (msg) {
        // 失败 → 重置 OTP 让用户重试：清空、解锁、focus 第一格、
        // 解锁登录按钮，submitted 标志归零。
        submitted = false;
        suppressChange = true;
        for (const h of otpInputs) {
          h.setValue('');
          h.setDisabled(false);
        }
        suppressChange = false;
        currentOtp = '';
        loginBtn.setDisabled(true);
        setTimeout(() => otpInputs[0].focus(), 0);
      }
    }

    return {
      dispose() {
        for (const h of handles) {
          try { h.dispose(); } catch { /* swallow */ }
        }
        for (const n of nodes) {
          n.removeFromParent();
          n.destroy();
        }
      },
      setError: setCodeError,
    };
  }

  // ===== Shared cooldown plumbing =====
  function startCooldown(): void {
    cooldownRemainingShared = SMS_RESEND_COOLDOWN_S;
    clearCooldownTimer();
    cooldownTimerShared = setInterval(() => {
      cooldownRemainingShared -= 1;
      if (cooldownRemainingShared <= 0) {
        cooldownRemainingShared = 0;
        clearCooldownTimer();
      }
    }, 1000);
  }
  function cooldownLabel(): string {
    if (cooldownRemainingShared <= 0) return '重新发送验证码';
    // Telegram 风格 mm:ss — 60s 内显示 0:59 / 0:48 等。
    // 用 String() + 拼 '0' 替代 padStart（Cocos demo tsconfig lib
    // 锁在 ES2015，padStart 是 ES2017 + 引入的）。
    const min = Math.floor(cooldownRemainingShared / 60);
    const sec = cooldownRemainingShared % 60;
    const secStr = sec < 10 ? `0${sec}` : `${sec}`;
    return `重新发送验证码 (${min}:${secStr})`;
  }

  // ===== mount initial step =====
  showPhoneStep();

  return {
    setCodeError(message: string | null): void {
      // 只在 OTP 页面有效；在 phone 页面调是 no-op（手机号校验错误
      // 由 phoneField.setError 自己管，宿主不应该往那里塞）。
      if (currentStepKind !== 'code') return;
      currentStep?.setError?.(message);
    },
    dispose() {
      clearCooldownTimer();
      currentStep?.dispose();
      currentStep = null;
      bg.removeFromParent();
      bg.destroy();
    },
  };
}

// ===== validation =====

/** Per-country maxLength for the local phone-number portion (excludes
 *  dial code). 中国大陆固定 11 位；其他地区给 15 位上限（E.164 的
 *  E.164 总长上限是 15 位含国家码，本地号段实际更短，留宽松值兜底）。 */
function phoneMaxLengthFor(country: Country): number {
  if (country.iso === 'CN') return 11;
  return 15;
}

/** Per-country placeholder hint — 中国大陆明确写「请输入 11 位手机号」，
 *  其他地区保留通用文案。 */
function phonePlaceholderFor(country: Country): string {
  if (country.iso === 'CN') return '请输入 11 位手机号';
  return '请输入手机号';
}

function validatePhone(country: Country, raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '请输入手机号';
  if (country.iso === 'CN') {
    if (digits.length !== 11) return '请输入正确的 11 位中国大陆手机号';
    if (!digits.startsWith('1')) return '中国大陆手机号必须以 1 开头';
    return null;
  }
  // 其他国家 / 地区只做最低位数校验，把更严格的规则交给服务端
  if (digits.length < 6) return '请输入正确的手机号';
  return null;
}

function formatFullMobile(country: Country, raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return `${country.dial}${digits}`;
}

function formatMaskedMobile(country: Country, raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return `${country.dial} ${digits}`;
  // 头 3 + 中间星号 + 尾 4：138****5678
  const head = digits.slice(0, 3);
  const tail = digits.slice(-4);
  return `${country.dial} ${head}****${tail}`;
}

function formatApplicationError(e: unknown): string {
  if (e instanceof Error) {
    // Surface short error message; PlatformAuthError messages are
    // already pre-formatted with httpStatus / applicationCode.
    return e.message.slice(0, 80);
  }
  return '发送失败，请稍后再试';
}

// ===== internal Node helpers =====

function makeFormSlot(parent: Node, x: number, y: number): Node {
  const slot = new Node('LoginFormSlot');
  slot.addComponent(UITransform);
  slot.setPosition(x, y);
  parent.addChild(slot);
  return slot;
}

function parseHex(input: string): RGBA {
  const hex = input.startsWith('#') ? input.slice(1) : input;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
  return { r, g, b, a };
}

function createPlainRect(name: string, width: number, height: number, color: RGBA): Node {
  const node = new Node(name);
  const ui = node.addComponent(UITransform);
  ui.setContentSize(width, height);
  const g = node.addComponent(Graphics);
  g.fillColor = new Color(color.r, color.g, color.b, color.a);
  const gAny = g as unknown as { rect?: (x: number, y: number, w: number, h: number) => void };
  if (typeof gAny.rect === 'function') {
    gAny.rect(-width / 2, -height / 2, width, height);
  } else {
    g.moveTo(-width / 2, -height / 2);
    g.lineTo(width / 2, -height / 2);
    g.lineTo(width / 2, height / 2);
    g.lineTo(-width / 2, height / 2);
    g.close();
  }
  g.fill();
  return node;
}

function createRoundedRect(
  name: string,
  width: number,
  height: number,
  radius: number,
  fill: RGBA,
  stroke: RGBA,
  strokeWidth: number,
): Node {
  const node = new Node(name);
  const ui = node.addComponent(UITransform);
  ui.setContentSize(width, height);
  const g = node.addComponent(Graphics);
  g.fillColor = new Color(fill.r, fill.g, fill.b, fill.a);
  g.strokeColor = new Color(stroke.r, stroke.g, stroke.b, stroke.a);
  g.lineWidth = strokeWidth;
  const gAny = g as unknown as {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    rect?: (x: number, y: number, w: number, h: number) => void;
  };
  if (typeof gAny.roundRect === 'function') {
    gAny.roundRect(-width / 2, -height / 2, width, height, radius);
  } else if (typeof gAny.rect === 'function') {
    gAny.rect(-width / 2, -height / 2, width, height);
  } else {
    g.moveTo(-width / 2, -height / 2);
    g.lineTo(width / 2, -height / 2);
    g.lineTo(width / 2, height / 2);
    g.lineTo(-width / 2, height / 2);
    g.close();
  }
  g.fill();
  g.stroke();
  return node;
}

interface PlainLabelOpts {
  text: string;
  fontSize: number;
  color: RGBA;
  width: number;
  height: number;
}

function createPlainLabel(name: string, opts: PlainLabelOpts): Node {
  const node = new Node(name);
  const ui = node.addComponent(UITransform);
  ui.setContentSize(opts.width, opts.height);
  const label = node.addComponent(Label);
  label.string = opts.text;
  label.fontSize = opts.fontSize;
  label.color = new Color(opts.color.r, opts.color.g, opts.color.b, opts.color.a);
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  label.overflow = Label.Overflow.SHRINK;
  return node;
}

/** Walk the TextInput root looking for the underlying cc.EditBox and
 *  switch its inputMode to PHONE_NUMBER. `NUMERIC` maps to
 *  `<input type="number">` on web which renders browser-native
 *  up/down step arrows next to the field; `PHONE_NUMBER` maps to
 *  `<input type="tel">` — same digits keyboard on mobile, no
 *  desktop spinner chrome. EditBox init runs in a microtask, so the
 *  double `setTimeout` pass catches both the immediate + late-init
 *  windows. */
function setEditBoxTelMode(root: Node): void {
  setTimeout(() => {
    const eb = findEditBox(root);
    if (eb) eb.inputMode = EditBox.InputMode.PHONE_NUMBER;
  }, 0);
  setTimeout(() => {
    const eb = findEditBox(root);
    if (eb) eb.inputMode = EditBox.InputMode.PHONE_NUMBER;
  }, 80);
}

function findEditBox(root: Node): EditBox | null {
  const c = root.getComponent(EditBox);
  if (c) return c;
  for (const child of root.children) {
    const found = findEditBox(child);
    if (found) return found;
  }
  return null;
}
