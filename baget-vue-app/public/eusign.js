/* Minimal bridge for the IIT SignWidget postMessage API.
 * Protocol and method names follow the IIT EndUserSignWidgetConnector supplied
 * with the local proof-of-concept. Cryptographic operations remain inside IIT.
 */
(function (root) {
  "use strict";

  function EndUser(parentId, id, src, formType, formParams) {
    this.sender = "EndUserSignWidgetConnector";
    this.reciever = "EndUserSignWidget";
    this.parentId = parentId;
    this.id = id;
    this.src = src;
    this.formType = formType || 0;
    this.formParams = formParams || null;
    this.m_promises = [];
    this.m_listeners = [];
    this.iframe = this._appendIframe();
  }

  EndUser.prototype._appendIframe = function () {
    var iframe = document.createElement("iframe");
    var url = new URL(this.src);
    url.searchParams.set("address", window.location.origin);
    url.searchParams.set("formType", String(this.formType));
    url.searchParams.set("debug", "false");
    var formParams = this.formParams || {};
    Object.keys(formParams).forEach(function (key) {
      url.searchParams.set(key, String(formParams[key]));
    });
    iframe.id = this.id;
    iframe.src = url.toString();
    iframe.title = "Віджет підпису ІІТ";
    iframe.setAttribute("frameborder", "0");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    document.getElementById(this.parentId).appendChild(iframe);

    var self = this;
    this._messageListener = function (event) {
      if (event.origin !== url.origin) return;
      self._receiveMessage(event);
    };
    window.addEventListener("message", this._messageListener, false);
    return iframe;
  };

  EndUser.prototype._postMessage = function (cmd, params, resolve, reject) {
    var self = this;
    var msg = {
      sender: this.sender,
      reciever: this.reciever,
      id: -1,
      cmd: cmd,
      params: params
    };
    var promise = new Promise(function (res, rej) {
      msg.id = self.m_promises.push({
        resolve: typeof resolve === "function" ? resolve : res,
        reject: typeof reject === "function" ? reject : rej,
        msg: msg
      });
    });
    try {
      this.iframe.contentWindow.postMessage(msg, new URL(this.src).origin);
    } catch (error) {
      var pending = this.m_promises[msg.id - 1];
      if (pending) pending.reject(error);
    }
    return promise;
  };

  EndUser.prototype._receiveMessage = function (event) {
    var data = event.data;
    if (!data || data.reciever !== this.sender || data.sender !== this.reciever) return;
    if (data.id === -1) {
      var self = this;
      var queued = this.m_promises;
      this.m_promises = [];
      queued.forEach(function (item) {
        self._postMessage(item.msg.cmd, item.msg.params, item.resolve, item.reject);
      });
      return;
    }
    if (data.id === -2) {
      var listener = this.m_listeners[data.result && data.result.type];
      if (listener) listener(data.result);
      return;
    }
    var item = this.m_promises[data.id - 1];
    if (!item) return;
    delete this.m_promises[data.id - 1];
    if (data.error) item.reject(data.error);
    else item.resolve(data.result);
  };

  EndUser.prototype.ReadPrivateKey = function () {
    return this._postMessage("ReadPrivateKey", Array.prototype.slice.call(arguments));
  };
  EndUser.prototype.SignData = function (data, external, asBase64String, signAlgo, previousSign, signType) {
    return this._postMessage("SignData", Array.prototype.slice.call(arguments));
  };
  EndUser.prototype.ResetPrivateKey = function () {
    return this._postMessage("ResetPrivateKey", Array.prototype.slice.call(arguments));
  };
  EndUser.prototype.AddEventListener = function (eventType, listener) {
    this.m_listeners[eventType] = listener;
    return this._postMessage("AddEventListener", [eventType]);
  };
  EndUser.prototype.destroy = function () {
    if (this._messageListener) window.removeEventListener("message", this._messageListener);
    if (this.iframe && this.iframe.parentNode) this.iframe.parentNode.removeChild(this.iframe);
    this.m_promises = [];
  };

  EndUser.FormType = { ReadPKey: 1, MakeNewCertificate: 2, SignFile: 3, ViewPKeyCertificates: 4 };
  EndUser.SignAlgo = { DSTU4145WithGOST34311: 1, RSAWithSHA: 2, ECDSAWithSHA: 3 };
  EndUser.SignType = { CAdES_BES: 1, CAdES_T: 4, CAdES_C: 8, CAdES_X_Long: 16 };
  root.EndUser = EndUser;
})(window);
